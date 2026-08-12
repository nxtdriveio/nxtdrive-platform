package io.nxtdrive.instructeur.ui

import io.nxtdrive.instructeur.core.model.NativeAppointment
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal const val INSTRUCTOR_DAY_START_HOUR = 0
internal const val INSTRUCTOR_DAY_END_HOUR = 24
internal const val INSTRUCTOR_DAY_MINUTES = 24 * 60
internal const val INSTRUCTOR_DAY_SLOT_MINUTES = 15

internal enum class NativeCalendarTone { BLUE, VIOLET, ROSE, AMBER, GREEN, TEAL, NEUTRAL }

internal data class NativeAppointmentPresentation(
    val type: String,
    val label: String,
    val shortLabel: String,
    val tone: NativeCalendarTone,
    val quickAdd: Boolean = true,
)

internal val nativeAppointmentPresentations = listOf(
    NativeAppointmentPresentation("lesson", "Rijles", "Rijles", NativeCalendarTone.BLUE),
    NativeAppointmentPresentation("trial", "Proefles", "Proefles", NativeCalendarTone.VIOLET, false),
    NativeAppointmentPresentation("exam", "Examen", "Examen", NativeCalendarTone.ROSE),
    NativeAppointmentPresentation("interim_test", "Tussentijdse toets", "Toets", NativeCalendarTone.AMBER),
    NativeAppointmentPresentation("theory_guidance", "Theoriebegeleiding", "Theorie", NativeCalendarTone.AMBER),
    NativeAppointmentPresentation("free_block", "Vrij blok", "Overig", NativeCalendarTone.NEUTRAL),
    NativeAppointmentPresentation("break", "Pauze", "Pauze", NativeCalendarTone.NEUTRAL),
    NativeAppointmentPresentation("private_block", "Privéblokkade", "Privé", NativeCalendarTone.GREEN),
    NativeAppointmentPresentation("maintenance", "Onderhoud", "Onderhoud", NativeCalendarTone.NEUTRAL),
    NativeAppointmentPresentation("admin", "Administratie", "Administratie", NativeCalendarTone.TEAL),
    NativeAppointmentPresentation("vacation", "Vakantie", "Vakantie", NativeCalendarTone.GREEN),
)

internal fun nativeAppointmentPresentation(type: String): NativeAppointmentPresentation =
    nativeAppointmentPresentations.firstOrNull { it.type == type } ?:
        NativeAppointmentPresentation(type, "Afspraak", "Afspraak", NativeCalendarTone.NEUTRAL)

internal data class NativeTimelinePosition(
    val appointment: NativeAppointment,
    val startMinute: Int,
    val durationMinutes: Int,
    val column: Int,
    val columnCount: Int,
)

internal fun snapNativeTimelineMinute(minutes: Int): Int =
    ((minutes.coerceIn(0, INSTRUCTOR_DAY_MINUTES - 1) + 7) / INSTRUCTOR_DAY_SLOT_MINUTES *
        INSTRUCTOR_DAY_SLOT_MINUTES).coerceAtMost(INSTRUCTOR_DAY_MINUTES - INSTRUCTOR_DAY_SLOT_MINUTES)

internal fun nativeDayKey(isoValue: String, timeZone: String): String? =
    parseNativeIso(isoValue)?.let { instant ->
        SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
            this.timeZone = TimeZone.getTimeZone(timeZone)
        }.format(instant)
    }

internal fun nativeMinuteOfDay(isoValue: String, timeZone: String): Int? =
    parseNativeIso(isoValue)?.let { instant ->
        val formatter = SimpleDateFormat("H:m", Locale.ROOT).apply {
            this.timeZone = TimeZone.getTimeZone(timeZone)
        }
        val parts = formatter.format(instant).split(":")
        parts[0].toInt() * 60 + parts[1].toInt()
    }

internal fun nativeIsFuture(isoValue: String, now: Date = Date()): Boolean =
    parseNativeIso(isoValue)?.after(now) == true

internal fun layoutNativeDayAppointments(
    appointments: List<NativeAppointment>,
    timeZone: String,
): List<NativeTimelinePosition> {
    data class Candidate(
        val appointment: NativeAppointment,
        val start: Int,
        val end: Int,
    )

    val candidates = appointments.mapNotNull { appointment ->
        val rawStart = nativeMinuteOfDay(appointment.startsAt, timeZone) ?: return@mapNotNull null
        val rawEnd = nativeMinuteOfDay(appointment.endsAt, timeZone) ?: return@mapNotNull null
        val start = (rawStart - INSTRUCTOR_DAY_START_HOUR * 60).coerceAtLeast(0)
        val end = (rawEnd - INSTRUCTOR_DAY_START_HOUR * 60).coerceAtMost(INSTRUCTOR_DAY_MINUTES)
        if (end <= 0 || start >= INSTRUCTOR_DAY_MINUTES || end <= start) null
        else Candidate(appointment, start, end)
    }.sortedWith(compareBy<Candidate> { it.start }.thenByDescending { it.end })

    val result = mutableListOf<NativeTimelinePosition>()
    var groupStart = 0
    while (groupStart < candidates.size) {
        var groupEnd = groupStart + 1
        var latestEnd = candidates[groupStart].end
        while (groupEnd < candidates.size && candidates[groupEnd].start < latestEnd) {
            latestEnd = maxOf(latestEnd, candidates[groupEnd].end)
            groupEnd += 1
        }

        val group = candidates.subList(groupStart, groupEnd)
        val laneEnds = mutableListOf<Int>()
        val assignments = group.map { candidate ->
            val openLane = laneEnds.indexOfFirst { end -> end <= candidate.start }
            val lane = if (openLane >= 0) openLane else laneEnds.size
            if (openLane >= 0) laneEnds[openLane] = candidate.end else laneEnds += candidate.end
            candidate to lane
        }
        val columnCount = laneEnds.size
        assignments.forEach { (candidate, lane) ->
            result += NativeTimelinePosition(
                appointment = candidate.appointment,
                startMinute = candidate.start,
                durationMinutes = candidate.end - candidate.start,
                column = lane,
                columnCount = columnCount,
            )
        }
        groupStart = groupEnd
    }
    return result
}

private fun parseNativeIso(value: String): Date? {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )
    return patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.ROOT).apply {
                isLenient = false
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(value)
        }.getOrNull()
    }
}
