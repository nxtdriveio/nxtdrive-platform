package io.nxtdrive.instructeur

import io.nxtdrive.instructeur.core.auth.AuthRemoteDataSource
import io.nxtdrive.instructeur.core.auth.SessionManager
import io.nxtdrive.instructeur.core.auth.SessionRequiredException
import io.nxtdrive.instructeur.core.auth.SessionRestoreResult
import io.nxtdrive.instructeur.core.auth.SessionStore
import io.nxtdrive.instructeur.core.model.AuthSessionEnvelope
import io.nxtdrive.instructeur.core.model.AuthTokenPayload
import io.nxtdrive.instructeur.core.model.AuthUserPayload
import io.nxtdrive.instructeur.core.model.NativeSession
import io.nxtdrive.instructeur.core.model.TenantSummary
import io.nxtdrive.instructeur.core.network.ApiException
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionManagerTest {
    @Test
    fun restoreKeepsAValidSessionWithoutRefreshing() = runTest {
        val store = FakeStore(session(expiresAt = 2_000))
        val remote = FakeAuthRemote()
        val manager = SessionManager(store, remote) { 1_000 }

        val restored = manager.restore()

        assertTrue(restored is SessionRestoreResult.Active)
        assertEquals(0, remote.refreshCalls)
        assertEquals("access-old", store.value?.accessToken)
    }

    @Test
    fun restoreRotatesAnExpiringSessionAndPersistsTheNewRefreshToken() = runTest {
        val store = FakeStore(session(expiresAt = 1_050))
        val remote = FakeAuthRemote()
        val manager = SessionManager(store, remote) { 1_000 }

        val restored = manager.restore()

        assertTrue(restored is SessionRestoreResult.Active)
        assertEquals(1, remote.refreshCalls)
        assertEquals("refresh-new", store.value?.refreshToken)
        assertEquals("access-new", store.value?.accessToken)
    }

    @Test
    fun concurrentCallsShareOneRefreshRotation() = runTest {
        val store = FakeStore(session(expiresAt = 1_050))
        val remote = FakeAuthRemote()
        val manager = SessionManager(store, remote) { 1_000 }

        val tokens = List(8) {
            async { manager.authorized { session -> session.accessToken } }
        }.awaitAll()

        assertEquals(1, remote.refreshCalls)
        assertTrue(tokens.all { it == "access-new" })
    }

    @Test
    fun concurrentUnauthorizedResponsesShareOneForcedRefreshRotation() = runTest {
        val store = FakeStore(session(expiresAt = 2_000))
        val remote = FakeAuthRemote()
        val manager = SessionManager(store, remote) { 1_000 }
        manager.restore()
        val oldTokenCalls = AtomicInteger()
        val allOldTokenCallsStarted = CompletableDeferred<Unit>()

        val tokens = List(8) {
            async {
                manager.authorized { active ->
                    if (active.accessToken == "access-old") {
                        if (oldTokenCalls.incrementAndGet() == 8) {
                            allOldTokenCallsStarted.complete(Unit)
                        }
                        allOldTokenCallsStarted.await()
                        throw ApiException(401, "invalid_session", "Ingetrokken")
                    }
                    active.accessToken
                }
            }
        }.awaitAll()

        assertEquals(1, remote.refreshCalls)
        assertTrue(tokens.all { it == "access-new" })
    }

    @Test
    fun rejectedRefreshClearsUnreadableSession() = runTest {
        val store = FakeStore(session(expiresAt = 1_050))
        val remote = FakeAuthRemote(
            refreshFailure = ApiException(401, "invalid_refresh_token", "Verlopen"),
        )
        val manager = SessionManager(store, remote) { 1_000 }

        val restored = manager.restore()

        assertEquals(SessionRestoreResult.SignedOut, restored)
        assertNull(store.value)
    }

    @Test
    fun revokedInstructorAccessClearsTheNativeSession() = runTest {
        val store = FakeStore(session(expiresAt = 1_050))
        val remote = FakeAuthRemote(
            refreshFailure = ApiException(403, "instructor_access_required", "Geen toegang"),
        )
        val manager = SessionManager(store, remote) { 1_000 }

        val restored = manager.restore()

        assertEquals(SessionRestoreResult.SignedOut, restored)
        assertNull(store.value)
    }

    @Test
    fun unauthorizedApiRetryClearsSessionWhenRefreshWasRevoked() = runTest {
        val store = FakeStore(session(expiresAt = 2_000))
        val remote = FakeAuthRemote(
            refreshFailure = ApiException(401, "invalid_refresh_token", "Verlopen"),
        )
        val manager = SessionManager(store, remote) { 1_000 }
        manager.restore()

        val failure = runCatching {
            manager.authorized<Unit> {
                throw ApiException(401, "invalid_session", "Ingetrokken")
            }
        }.exceptionOrNull()

        assertTrue(failure is SessionRequiredException)
        assertNull(store.value)
    }

    @Test
    fun staleTenantAccessForcesARefreshAndRetriesWithTheRecoveredSession() = runTest {
        val store = FakeStore(session(expiresAt = 2_000))
        val remote = FakeAuthRemote()
        val manager = SessionManager(store, remote) { 1_000 }
        manager.restore()

        val token = manager.authorized { active ->
            if (active.accessToken == "access-old") {
                throw ApiException(403, "tenant_access_denied", "Geen toegang")
            }
            active.accessToken
        }

        assertEquals("access-new", token)
        assertEquals(1, remote.refreshCalls)
        assertEquals("refresh-new", store.value?.refreshToken)
    }

    private fun session(expiresAt: Long) = NativeSession(
        accessToken = "access-old",
        refreshToken = "refresh-old",
        expiresAtEpochSeconds = expiresAt,
        userId = "user-1",
        email = "instructeur@nxtdrive.test",
        activeTenantId = "tenant-1",
        activeTenantName = "NXTDRIVE",
    )
}

private class FakeStore(
    var value: NativeSession?,
) : SessionStore {
    override suspend fun read() = value

    override suspend fun write(session: NativeSession) {
        value = session
    }

    override suspend fun clear() {
        value = null
    }
}

private class FakeAuthRemote(
    private val refreshFailure: Throwable? = null,
) : AuthRemoteDataSource {
    var refreshCalls = 0

    override suspend fun login(email: String, password: String): AuthSessionEnvelope =
        envelope()

    override suspend fun refresh(
        refreshToken: String,
        tenantId: String,
    ): AuthSessionEnvelope {
        refreshCalls += 1
        refreshFailure?.let { throw it }
        return envelope()
    }

    override suspend fun logout(session: NativeSession, everywhere: Boolean) = Unit

    private fun envelope() = AuthSessionEnvelope(
        session = AuthTokenPayload(
            accessToken = "access-new",
            refreshToken = "refresh-new",
            expiresAtEpochSeconds = 5_000,
        ),
        user = AuthUserPayload(
            id = "user-1",
            email = "instructeur@nxtdrive.test",
        ),
        tenant = TenantSummary(
            id = "tenant-1",
            name = "NXTDRIVE",
        ),
    )
}
