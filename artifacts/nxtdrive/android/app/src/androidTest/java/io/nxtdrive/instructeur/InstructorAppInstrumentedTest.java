package io.nxtdrive.instructeur;

import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class InstructorAppInstrumentedTest {
    @Test
    public void installedPackageUsesTheInstructorIdentity() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().startsWith("io.nxtdrive.instructeur"));
    }
}
