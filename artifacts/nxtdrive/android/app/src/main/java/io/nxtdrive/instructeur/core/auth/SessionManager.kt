package io.nxtdrive.instructeur.core.auth

import io.nxtdrive.instructeur.core.model.NativeSession
import io.nxtdrive.instructeur.core.model.toNativeSession
import io.nxtdrive.instructeur.core.network.ApiException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface SessionRestoreResult {
    data class Active(val session: NativeSession) : SessionRestoreResult
    data object SignedOut : SessionRestoreResult
    data class Unavailable(val message: String) : SessionRestoreResult
}

data class LogoutResult(
    val remotelyRevoked: Boolean,
)

class SessionRequiredException : IllegalStateException("Er is geen actieve sessie.")

class SessionManager(
    private val store: SessionStore,
    private val authApi: AuthRemoteDataSource,
    private val nowEpochSeconds: () -> Long = { System.currentTimeMillis() / 1_000L },
) {
    private val mutex = Mutex()
    private var current: NativeSession? = null

    suspend fun restore(): SessionRestoreResult = mutex.withLock {
        current = store.read()
        val session = current ?: return SessionRestoreResult.SignedOut
        if (!shouldRefresh(session)) return SessionRestoreResult.Active(session)

        return try {
            SessionRestoreResult.Active(refreshLocked(session))
        } catch (error: ApiException) {
            if (isTerminalRefreshError(error)) {
                clearLocked()
                SessionRestoreResult.SignedOut
            } else {
                SessionRestoreResult.Unavailable(error.message)
            }
        } catch (_: Exception) {
            SessionRestoreResult.Unavailable(
                "Je sessie kon offline niet worden gecontroleerd. Probeer opnieuw zodra je verbinding hebt.",
            )
        }
    }

    suspend fun login(email: String, password: String): NativeSession = mutex.withLock {
        val session = authApi.login(email.trim(), password).toNativeSession()
        store.write(session)
        current = session
        session
    }

    suspend fun logout(everywhere: Boolean): LogoutResult {
        val session = mutex.withLock { current ?: store.read() }
        var remotelyRevoked = session == null
        if (session != null) {
            remotelyRevoked = runCatching { authApi.logout(session, everywhere) }.isSuccess
        }
        mutex.withLock { clearLocked() }
        return LogoutResult(remotelyRevoked)
    }

    suspend fun switchTenant(tenantId: String, tenantName: String) = mutex.withLock {
        val session = current ?: throw SessionRequiredException()
        val updated = session.copy(
            activeTenantId = tenantId,
            activeTenantName = tenantName,
        )
        store.write(updated)
        current = updated
    }

    suspend fun currentSession(): NativeSession? = mutex.withLock {
        current ?: store.read().also { current = it }
    }

    suspend fun <T> authorized(block: suspend (NativeSession) -> T): T {
        val session = validSession(forceRefresh = false)
        return try {
            block(session)
        } catch (error: ApiException) {
            val sessionRejected = error.statusCode == 401 ||
                error.statusCode == 403 &&
                error.errorCode in setOf(
                    "instructor_access_required",
                    "tenant_access_denied",
                )
            if (!sessionRejected) throw error
            val refreshed = validSession(
                forceRefresh = true,
                rejectedAccessToken = session.accessToken,
            )
            block(refreshed)
        }
    }

    private suspend fun validSession(
        forceRefresh: Boolean,
        rejectedAccessToken: String? = null,
    ): NativeSession = mutex.withLock {
        val session = current ?: store.read() ?: throw SessionRequiredException()
        current = session
        if (
            forceRefresh &&
            rejectedAccessToken != null &&
            session.accessToken != rejectedAccessToken
        ) {
            return@withLock session
        }
        if (!forceRefresh && !shouldRefresh(session)) return@withLock session
        try {
            refreshLocked(session)
        } catch (error: ApiException) {
            if (isTerminalRefreshError(error)) {
                clearLocked()
                throw SessionRequiredException()
            }
            throw error
        }
    }

    private suspend fun refreshLocked(session: NativeSession): NativeSession {
        val refreshed = authApi.refresh(
            refreshToken = session.refreshToken,
            tenantId = session.activeTenantId,
        ).toNativeSession()
        store.write(refreshed)
        current = refreshed
        return refreshed
    }

    private fun shouldRefresh(session: NativeSession) =
        session.expiresAtEpochSeconds <= nowEpochSeconds() + REFRESH_MARGIN_SECONDS

    private fun isTerminalRefreshError(error: ApiException) =
        error.statusCode == 400 || error.statusCode == 401 || error.statusCode == 403

    private suspend fun clearLocked() {
        current = null
        store.clear()
    }

    private companion object {
        const val REFRESH_MARGIN_SECONDS = 90L
    }
}
