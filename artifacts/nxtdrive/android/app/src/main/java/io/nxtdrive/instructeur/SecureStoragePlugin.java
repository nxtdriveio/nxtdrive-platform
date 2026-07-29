package io.nxtdrive.instructeur;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NxtSecureStorage")
public class SecureStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "nxtdrive-instructor-local-drafts";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String PREFERENCES = "nxtdrive-secure-storage";
    private static final int MAX_VALUE_BYTES = 1_048_576;

    @PluginMethod
    public void set(PluginCall call) {
        String key = validatedKey(call);
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("Both key and value are required.");
            return;
        }
        if (value.getBytes(StandardCharsets.UTF_8).length > MAX_VALUE_BYTES) {
            call.reject("Secure storage values are limited to 1 MiB.");
            return;
        }

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String payload =
                Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                    + "."
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            preferences().edit().putString(key, payload).apply();
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to encrypt local data.", exception);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = validatedKey(call);
        if (key == null) {
            call.reject("A valid key is required.");
            return;
        }

        String payload = preferences().getString(key, null);
        JSObject result = new JSObject();
        if (payload == null) {
            result.put("value", null);
            call.resolve(result);
            return;
        }

        try {
            String[] parts = payload.split("\\.", 2);
            if (parts.length != 2) {
                throw new IllegalStateException("Invalid encrypted payload.");
            }
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            byte[] plain = cipher.doFinal(encrypted);
            result.put("value", new String(plain, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception exception) {
            preferences().edit().remove(key).apply();
            call.reject("Unable to decrypt local data; the unreadable value was removed.", exception);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = validatedKey(call);
        if (key == null) {
            call.reject("A valid key is required.");
            return;
        }
        preferences().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        preferences().edit().clear().apply();
        call.resolve();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private String validatedKey(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !key.matches("[A-Za-z0-9._:-]{1,128}")) {
            return null;
        }
        return key;
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }
}
