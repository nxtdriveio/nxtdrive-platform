package io.nxtdrive.instructeur.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import io.nxtdrive.instructeur.core.AppContainer
import io.nxtdrive.instructeur.core.auth.SessionRestoreResult
import io.nxtdrive.instructeur.core.model.InstructorBootstrap
import io.nxtdrive.instructeur.core.model.NativeConversation
import io.nxtdrive.instructeur.core.model.NativeStudent
import io.nxtdrive.instructeur.core.model.NativeTask
import io.nxtdrive.instructeur.core.model.PlanningRequest
import io.nxtdrive.instructeur.core.model.StudentCreateRequest
import io.nxtdrive.instructeur.core.model.TaskMutationRequest
import io.nxtdrive.instructeur.core.network.ApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AppDestination {
    HOME,
    AGENDA,
    STUDENTS,
    TASKS,
    MORE,
    MESSAGES,
    SETTINGS,
}

enum class AuthPhase {
    BOOTSTRAPPING,
    SIGNED_OUT,
    READY,
    RECOVERABLE_ERROR,
}

data class InstructorUiState(
    val phase: AuthPhase = AuthPhase.BOOTSTRAPPING,
    val data: InstructorBootstrap? = null,
    val destination: AppDestination = AppDestination.HOME,
    val selectedConversationId: String? = null,
    val busy: Boolean = false,
    val message: String? = null,
    val sessionExpiresAtEpochSeconds: Long? = null,
)

class InstructorViewModel(
    private val container: AppContainer,
) : ViewModel() {
    private val mutableState = MutableStateFlow(InstructorUiState())
    val state: StateFlow<InstructorUiState> = mutableState.asStateFlow()

    private var pendingDestination: AppDestination? = null

    init {
        restoreSession()
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(message = "Vul je e-mailadres en wachtwoord in.") }
            return
        }
        runBusy {
            val session = container.sessionManager.login(email, password)
            mutableState.update {
                it.copy(
                    phase = AuthPhase.BOOTSTRAPPING,
                    sessionExpiresAtEpochSeconds = session.expiresAtEpochSeconds,
                )
            }
            loadBootstrap()
        }
    }

    fun retrySession() {
        mutableState.update { it.copy(phase = AuthPhase.BOOTSTRAPPING, message = null) }
        restoreSession()
    }

    fun refresh() = runBusy { loadBootstrap() }

    fun navigate(destination: AppDestination) {
        mutableState.update {
            it.copy(
                destination = destination,
                selectedConversationId = if (destination == AppDestination.MESSAGES) {
                    it.selectedConversationId
                } else {
                    null
                },
            )
        }
    }

    fun openConversation(conversation: NativeConversation) {
        mutableState.update {
            it.copy(
                destination = AppDestination.MESSAGES,
                selectedConversationId = conversation.id,
            )
        }
    }

    fun closeConversation() {
        mutableState.update { it.copy(selectedConversationId = null) }
    }

    fun createTask(input: TaskMutationRequest) = runBusy {
        container.instructorRepository.createTask(input)
        loadBootstrap()
        setMessage("Taak toegevoegd.")
    }

    fun updateTask(task: NativeTask, input: TaskMutationRequest) = runBusy {
        container.instructorRepository.updateTask(task.id, input)
        loadBootstrap()
        setMessage("Taak bijgewerkt.")
    }

    fun deleteTask(task: NativeTask) = runBusy {
        container.instructorRepository.deleteTask(task.id)
        loadBootstrap()
        setMessage("Taak verwijderd.")
    }

    fun sendMessage(conversation: NativeConversation, body: String) {
        if (body.isBlank()) return
        runBusy {
            container.instructorRepository.sendMessage(conversation.id, body)
            loadBootstrap()
        }
    }

    fun addStudentCredits(student: NativeStudent, hours: Double, note: String) =
        runBusy {
            container.instructorRepository.addStudentCredits(student.id, hours, note)
            loadBootstrap()
            setMessage("Lestegoed toegevoegd aan ${student.name}.")
        }

    fun createPlanningItem(input: PlanningRequest) = runBusy {
        container.instructorRepository.createPlanningItem(input)
        loadBootstrap()
        setMessage("Afspraak ingepland.")
    }

    fun createStudent(input: StudentCreateRequest) = runBusy {
        val result = container.instructorRepository.createStudent(input)
        loadBootstrap()
        setMessage(result.emailWarning ?: "Leerling aangemaakt.")
    }

    fun switchTenant(id: String, name: String) = runBusy {
        val previous = container.sessionManager.currentSession()
        container.sessionManager.switchTenant(id, name)
        try {
            loadBootstrap()
        } catch (error: Throwable) {
            if (previous != null) {
                container.sessionManager.switchTenant(
                    previous.activeTenantId,
                    previous.activeTenantName,
                )
            }
            throw error
        }
        mutableState.update { it.copy(destination = AppDestination.HOME) }
    }

    fun logout(everywhere: Boolean) = runBusy {
        val result = container.sessionManager.logout(everywhere)
        mutableState.value = InstructorUiState(
            phase = AuthPhase.SIGNED_OUT,
            message = if (result.remotelyRevoked) {
                null
            } else {
                "Je lokale sessie is verwijderd. De server kon offline niet worden bereikt."
            },
        )
    }

    fun consumeMessage() {
        mutableState.update { it.copy(message = null) }
    }

    fun handleDeepLink(uri: Uri?) {
        if (uri?.scheme != "https" || uri.host != "nxtdrive.io") return
        val destination = when {
            uri.path?.startsWith("/instructeur/agenda") == true -> AppDestination.AGENDA
            uri.path?.startsWith("/instructeur/leerlingen") == true -> AppDestination.STUDENTS
            uri.path?.startsWith("/instructeur/taken") == true -> AppDestination.TASKS
            uri.path?.startsWith("/instructeur/berichten") == true -> AppDestination.MESSAGES
            uri.path?.startsWith("/instructeur/instellingen") == true -> AppDestination.SETTINGS
            uri.path?.startsWith("/instructeur") == true -> AppDestination.HOME
            else -> return
        }
        if (mutableState.value.phase == AuthPhase.READY) navigate(destination)
        else pendingDestination = destination
    }

    private fun restoreSession() {
        viewModelScope.launch {
            when (val restored = container.sessionManager.restore()) {
                is SessionRestoreResult.Active -> {
                    mutableState.update {
                        it.copy(sessionExpiresAtEpochSeconds = restored.session.expiresAtEpochSeconds)
                    }
                    runCatching { loadBootstrap() }.onFailure(::handleFailure)
                }
                SessionRestoreResult.SignedOut -> {
                    mutableState.update { it.copy(phase = AuthPhase.SIGNED_OUT) }
                }
                is SessionRestoreResult.Unavailable -> {
                    mutableState.update {
                        it.copy(
                            phase = AuthPhase.RECOVERABLE_ERROR,
                            message = restored.message,
                        )
                    }
                }
            }
        }
    }

    private suspend fun loadBootstrap() {
        val data = container.instructorRepository.bootstrap()
        val session = container.sessionManager.currentSession()
        mutableState.update {
            it.copy(
                phase = AuthPhase.READY,
                data = data,
                destination = pendingDestination ?: it.destination,
                sessionExpiresAtEpochSeconds = session?.expiresAtEpochSeconds,
                message = null,
            )
        }
        pendingDestination = null
    }

    private fun runBusy(block: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            runCatching { block() }
                .onFailure(::handleFailure)
            mutableState.update { it.copy(busy = false) }
        }
    }

    private fun handleFailure(error: Throwable) {
        if (error is io.nxtdrive.instructeur.core.auth.SessionRequiredException ||
            error is ApiException && error.statusCode == 401
        ) {
            mutableState.value = InstructorUiState(
                phase = AuthPhase.SIGNED_OUT,
                message = "Je sessie is verlopen. Log opnieuw in.",
            )
            return
        }
        val message = when (error) {
            is ApiException -> error.message
            else -> "De verbinding met NXTDRIVE is mislukt. Controleer je internetverbinding."
        }
        mutableState.update {
            it.copy(
                phase = if (it.phase == AuthPhase.BOOTSTRAPPING) {
                    AuthPhase.RECOVERABLE_ERROR
                } else {
                    it.phase
                },
                message = message,
            )
        }
    }

    private fun setMessage(message: String) {
        mutableState.update { it.copy(message = message) }
    }

    companion object {
        fun factory(container: AppContainer): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return InstructorViewModel(container) as T
                }
            }
    }
}
