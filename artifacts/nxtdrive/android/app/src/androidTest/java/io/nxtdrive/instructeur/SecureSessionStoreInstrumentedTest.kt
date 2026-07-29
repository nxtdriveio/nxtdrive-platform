package io.nxtdrive.instructeur

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.nxtdrive.instructeur.core.auth.SecureSessionStore
import io.nxtdrive.instructeur.core.model.NativeSession
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SecureSessionStoreInstrumentedTest {
    @Test
    fun sessionRoundTripUsesCiphertextAndCanBeCleared() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences(
            "nxtdrive-native-auth",
            Context.MODE_PRIVATE,
        )
        preferences.edit().clear().commit()
        val store = SecureSessionStore(
            context = context,
            json = Json {
                ignoreUnknownKeys = true
                explicitNulls = false
                encodeDefaults = true
            },
        )
        val session = NativeSession(
            accessToken = "access-token-must-be-encrypted",
            refreshToken = "refresh-token-must-be-encrypted",
            expiresAtEpochSeconds = 4_000_000_000,
            userId = "user-1",
            email = "instructeur@nxtdrive.test",
            activeTenantId = "tenant-1",
            activeTenantName = "NXTDRIVE",
        )

        store.write(session)

        assertEquals(session, store.read())
        val raw = preferences.getString("encrypted-session", "").orEmpty()
        assertFalse(raw.contains(session.accessToken))
        assertFalse(raw.contains(session.refreshToken))

        store.clear()
        assertNull(store.read())
    }
}
