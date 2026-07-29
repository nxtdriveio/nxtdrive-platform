package io.nxtdrive.instructeur;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NativeReleaseContractTest {
    @Test
    public void buildMetadataUsesTheInstructorApplicationIdentity() {
        assertTrue(BuildConfig.APPLICATION_ID.startsWith("io.nxtdrive.instructeur"));
        assertTrue(BuildConfig.VERSION_CODE > 0);
        assertFalse(BuildConfig.VERSION_NAME.isBlank());
        assertFalse(BuildConfig.GIT_SHA.isBlank());
        assertFalse(BuildConfig.RELEASE_CHANNEL.isBlank());
        assertTrue(BuildConfig.API_BASE_URL.startsWith("https://"));
    }

    @Test
    public void mainActivityIsAFullNativeActivity() {
        assertTrue(androidx.activity.ComponentActivity.class.isAssignableFrom(MainActivity.class));
        assertFalse(MainActivity.class.getSuperclass().getName().contains("capacitor"));
    }
}
