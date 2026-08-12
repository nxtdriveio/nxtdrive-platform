package io.nxtdrive.instructeur.core.model

import kotlinx.serialization.Serializable

@Serializable
data class InstructorBootstrap(
    val profile: InstructorProfile,
    val tenants: List<TenantSummary> = emptyList(),
    val stats: List<DashboardStat> = emptyList(),
    val appointments: List<NativeAppointment> = emptyList(),
    val students: List<NativeStudent> = emptyList(),
    val tasks: List<NativeTask> = emptyList(),
    val conversations: List<NativeConversation> = emptyList(),
    val vehicles: List<NativeVehicle> = emptyList(),
    val availability: List<NativeAvailabilityDay> = emptyList(),
)

@Serializable
data class InstructorProfile(
    val id: String,
    val name: String,
    val email: String,
    val activeTenantId: String,
    val tenantName: String,
    val tenantTimeZone: String = "Europe/Amsterdam",
    val ris20Qualified: Boolean,
)

@Serializable
data class DashboardStat(
    val label: String,
    val value: String,
    val hint: String,
    val tone: String,
)

@Serializable
data class NativeAppointment(
    val id: String,
    val kind: String,
    val title: String,
    val studentName: String? = null,
    val startsAt: String,
    val endsAt: String,
    val location: String? = null,
    val status: String,
)

@Serializable
data class NativeStudent(
    val id: String,
    val name: String,
    val email: String? = null,
    val phone: String? = null,
    val postcode: String? = null,
    val creditMinutes: Int = 0,
    val completedLessons: Int = 0,
    val nextLessonAt: String? = null,
)

@Serializable
data class NativeTask(
    val id: String,
    val title: String,
    val description: String? = null,
    val priority: String,
    val dueDate: String? = null,
    val status: String,
    val studentId: String? = null,
    val studentName: String? = null,
)

@Serializable
data class NativeConversation(
    val id: String,
    val studentName: String,
    val preview: String? = null,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val messages: List<NativeMessage> = emptyList(),
)

@Serializable
data class NativeMessage(
    val id: String,
    val sender: String,
    val body: String,
    val createdAt: String,
)

@Serializable
data class NativeVehicle(
    val id: String,
    val label: String,
    val licensePlate: String? = null,
    val transmission: String? = null,
    val status: String,
)

@Serializable
data class NativeAvailabilityDay(
    val label: String,
    val date: String,
    val active: Boolean,
    val intervalLabel: String,
    val availableMinutes: Int,
)

@Serializable
data class TaskMutationRequest(
    val title: String,
    val description: String? = null,
    val priority: String,
    val dueDate: String? = null,
    val studentId: String? = null,
)

@Serializable
data class TaskMutationResponse(
    val task: NativeTask,
)

@Serializable
data class MessageRequest(
    val body: String,
)

@Serializable
data class MessageResponse(
    val message: NativeMessage,
)

@Serializable
data class CreditRequest(
    val hours: Double,
    val note: String,
)

@Serializable
data class PlanningRequest(
    val type: String,
    val studentId: String? = null,
    val startsAtLocal: String,
    val durationMinutes: Int,
    val bufferMinutes: Int,
    val title: String? = null,
    val location: String? = null,
    val notes: String? = null,
    val vehicleId: String? = null,
)

@Serializable
data class StudentCreateRequest(
    val displayName: String,
    val email: String? = null,
    val phone: String? = null,
    val postcode: String? = null,
    val birthDate: String? = null,
    val addressLine: String? = null,
    val city: String? = null,
    val pickupAddress: String? = null,
    val educationType: String,
    val startDate: String? = null,
    val privacyConfirmed: Boolean,
)

@Serializable
data class StudentCreateResponse(
    val ok: Boolean,
    val studentId: String,
    val emailWarning: String? = null,
)

@Serializable
data class ApiSuccess(
    val ok: Boolean,
)
