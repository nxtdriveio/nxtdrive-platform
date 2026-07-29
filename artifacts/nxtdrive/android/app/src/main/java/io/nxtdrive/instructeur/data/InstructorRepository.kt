package io.nxtdrive.instructeur.data

import io.nxtdrive.instructeur.core.auth.SessionManager
import io.nxtdrive.instructeur.core.model.ApiSuccess
import io.nxtdrive.instructeur.core.model.CreditRequest
import io.nxtdrive.instructeur.core.model.InstructorBootstrap
import io.nxtdrive.instructeur.core.model.MessageRequest
import io.nxtdrive.instructeur.core.model.MessageResponse
import io.nxtdrive.instructeur.core.model.NativeMessage
import io.nxtdrive.instructeur.core.model.NativeTask
import io.nxtdrive.instructeur.core.model.PlanningRequest
import io.nxtdrive.instructeur.core.model.StudentCreateRequest
import io.nxtdrive.instructeur.core.model.StudentCreateResponse
import io.nxtdrive.instructeur.core.model.TaskMutationRequest
import io.nxtdrive.instructeur.core.model.TaskMutationResponse
import io.nxtdrive.instructeur.core.network.NativeApiClient

class InstructorRepository(
    private val api: NativeApiClient,
    private val sessions: SessionManager,
) {
    suspend fun bootstrap(): InstructorBootstrap = sessions.authorized { session ->
        val response = api.execute(
            path = "/api/mobile/instructor/bootstrap",
            accessToken = session.accessToken,
            tenantId = session.activeTenantId,
        )
        api.json.decodeFromString(InstructorBootstrap.serializer(), response)
    }

    suspend fun createTask(input: TaskMutationRequest): NativeTask =
        mutateTask("/api/mobile/instructor/tasks", "POST", input)

    suspend fun updateTask(taskId: String, input: TaskMutationRequest): NativeTask =
        mutateTask("/api/mobile/instructor/tasks/$taskId", "PATCH", input)

    suspend fun deleteTask(taskId: String) = sessions.authorized { session ->
        val response = api.execute(
            path = "/api/mobile/instructor/tasks/$taskId",
            method = "DELETE",
            accessToken = session.accessToken,
            tenantId = session.activeTenantId,
        )
        api.json.decodeFromString(ApiSuccess.serializer(), response)
    }

    suspend fun sendMessage(conversationId: String, body: String): NativeMessage =
        sessions.authorized { session ->
            val response = api.execute(
                path = "/api/mobile/instructor/conversations/$conversationId/messages",
                method = "POST",
                body = api.json.encodeToString(
                    MessageRequest.serializer(),
                    MessageRequest(body.trim()),
                ),
                accessToken = session.accessToken,
                tenantId = session.activeTenantId,
            )
            api.json.decodeFromString(MessageResponse.serializer(), response).message
        }

    suspend fun addStudentCredits(studentId: String, hours: Double, note: String) =
        sessions.authorized { session ->
            val response = api.execute(
                path = "/api/mobile/instructor/students/$studentId/credits",
                method = "POST",
                body = api.json.encodeToString(
                    CreditRequest.serializer(),
                    CreditRequest(hours, note.trim()),
                ),
                accessToken = session.accessToken,
                tenantId = session.activeTenantId,
            )
            api.json.decodeFromString(ApiSuccess.serializer(), response)
        }

    suspend fun createPlanningItem(input: PlanningRequest) =
        sessions.authorized { session ->
            val response = api.execute(
                path = "/api/mobile/instructor/planning",
                method = "POST",
                body = api.json.encodeToString(PlanningRequest.serializer(), input),
                accessToken = session.accessToken,
                tenantId = session.activeTenantId,
            )
            api.json.decodeFromString(ApiSuccess.serializer(), response)
        }

    suspend fun createStudent(input: StudentCreateRequest): StudentCreateResponse =
        sessions.authorized { session ->
            val response = api.execute(
                path = "/api/mobile/instructor/students",
                method = "POST",
                body = api.json.encodeToString(StudentCreateRequest.serializer(), input),
                accessToken = session.accessToken,
                tenantId = session.activeTenantId,
            )
            api.json.decodeFromString(StudentCreateResponse.serializer(), response)
        }

    private suspend fun mutateTask(
        path: String,
        method: String,
        input: TaskMutationRequest,
    ): NativeTask = sessions.authorized { session ->
        val response = api.execute(
            path = path,
            method = method,
            body = api.json.encodeToString(TaskMutationRequest.serializer(), input),
            accessToken = session.accessToken,
            tenantId = session.activeTenantId,
        )
        api.json.decodeFromString(TaskMutationResponse.serializer(), response).task
    }
}
