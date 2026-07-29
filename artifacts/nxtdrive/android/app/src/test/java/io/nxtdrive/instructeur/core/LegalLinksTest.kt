package io.nxtdrive.instructeur.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LegalLinksTest {
    @Test
    fun `legal links use public canonical https pages`() {
        assertEquals("https://nxtdrive.io/privacy", LegalLinks.PRIVACY_POLICY)
        assertEquals(
            "https://nxtdrive.io/account-verwijderen",
            LegalLinks.ACCOUNT_DELETION,
        )
        assertTrue(LegalLinks.PRIVACY_POLICY.startsWith("https://"))
        assertTrue(LegalLinks.ACCOUNT_DELETION.startsWith("https://"))
    }
}
