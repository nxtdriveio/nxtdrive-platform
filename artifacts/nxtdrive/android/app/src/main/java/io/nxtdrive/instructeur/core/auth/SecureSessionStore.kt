package io.nxtdrive.instructeur.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import io.nxtdrive.instructeur.core.model.NativeSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SessionStore {
    suspend fun read(): NativeSession?
    suspend fun write(session: NativeSession)
    suspend fun clear()
}

class SecureSessionStore(
    context: Context,
    private val json: Json,
) : SessionStore {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    override suspend fun read(): NativeSession? = withContext(Dispatchers.IO) {
        val payload = preferences.getString(SESSION_KEY, null) ?: return@withContext null
        runCatching {
            val parts = payload.split('.', limit = 3)
            require(parts.size == 3 && parts[0] == PAYLOAD_VERSION)
            val cipher = Cipher.getInstance(CIPHER)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)),
            )
            val plaintext = cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP))
            json.decodeFromString<NativeSession>(plaintext.decodeToString())
        }.getOrElse {
            preferences.edit { remove(SESSION_KEY) }
            null
        }
    }

    override suspend fun write(session: NativeSession) = withContext(Dispatchers.IO) {
        val cipher = Cipher.getInstance(CIPHER)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(
            json.encodeToString(NativeSession.serializer(), session).encodeToByteArray(),
        )
        val payload = listOf(
            PAYLOAD_VERSION,
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            Base64.encodeToString(encrypted, Base64.NO_WRAP),
        ).joinToString(".")
        preferences.edit { putString(SESSION_KEY, payload) }
    }

    override suspend fun clear() = withContext(Dispatchers.IO) {
        preferences.edit { remove(SESSION_KEY) }
        Unit
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val CIPHER = "AES/GCM/NoPadding"
        const val KEY_ALIAS = "nxtdrive-instructor-session-v1"
        const val PREFERENCES = "nxtdrive-native-auth"
        const val SESSION_KEY = "encrypted-session"
        const val PAYLOAD_VERSION = "v1"
    }
}
