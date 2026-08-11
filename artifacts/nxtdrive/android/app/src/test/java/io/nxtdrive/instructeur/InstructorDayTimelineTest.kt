package io.nxtdrive.instructeur

import io.nxtdrive.instructeur.core.model.NativeAppointment
import io.nxtdrive.instructeur.ui.layoutNativeDayAppointments
import io.nxtdrive.instructeur.ui.nativeDayKey
import io.nxtdrive.instructeur.ui.nativeMinuteOfDay
import io.nxtdrive.instructeur.ui.snapNativeTimelineMinute
import org.junit.Assert.assertEquals
import org.junit.Test

class InstructorDayTimelineTest {
    @Test
    fun `snaps and clamps quarter-hour slots`() {
        assertEquals(0, snapNativeTimelineMinute(7))
        assertEquals(15, snapNativeTimelineMinute(14))
        assertEquals(15, snapNativeTimelineMinute(16))
        assertEquals(30, snapNativeTimelineMinute(31))
        assertEquals(885, snapNativeTimelineMinute(899))
    }

    @Test
    fun `uses tenant timezone instead of device timezone`() {
        assertEquals("2026-08-11", nativeDayKey("2026-08-10T22:15:00Z", "Europe/Amsterdam"))
        assertEquals(7 * 60 + 15, nativeMinuteOfDay("2026-08-11T05:15:00Z", "Europe/Amsterdam"))
    }

    @Test
    fun `clips appointments and separates true overlaps`() {
        val first = appointment("one", "2026-08-11T04:30:00Z", "2026-08-11T06:00:00Z")
        val second = appointment("two", "2026-08-11T05:30:00Z", "2026-08-11T06:30:00Z")
        val adjacent = appointment("three", "2026-08-11T06:30:00Z", "2026-08-11T07:00:00Z")

        val layout = layoutNativeDayAppointments(listOf(first, second, adjacent), "Europe/Amsterdam")

        assertEquals(3, layout.size)
        assertEquals(0, layout[0].startMinute)
        assertEquals(60, layout[0].durationMinutes)
        assertEquals(2, layout[0].columnCount)
        assertEquals(2, layout[1].columnCount)
        assertEquals(1, layout[2].columnCount)
    }

    private fun appointment(id: String, start: String, end: String) = NativeAppointment(
        id = id,
        kind = "lesson",
        title = "Rijles",
        startsAt = start,
        endsAt = end,
        status = "scheduled",
    )
}
