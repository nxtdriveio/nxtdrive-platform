package io.nxtdrive.instructeur.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.nxtdrive.instructeur.BuildConfig
import io.nxtdrive.instructeur.core.LegalLinks
import io.nxtdrive.instructeur.core.model.DashboardStat
import io.nxtdrive.instructeur.core.model.InstructorBootstrap
import io.nxtdrive.instructeur.core.model.NativeAppointment
import io.nxtdrive.instructeur.core.model.NativeConversation
import io.nxtdrive.instructeur.core.model.NativeStudent
import io.nxtdrive.instructeur.core.model.NativeTask
import io.nxtdrive.instructeur.core.model.PlanningRequest
import io.nxtdrive.instructeur.core.model.StudentCreateRequest
import io.nxtdrive.instructeur.core.model.TaskMutationRequest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

private data class NavigationItem(
    val destination: AppDestination,
    val label: String,
    val icon: ImageVector,
)

private val primaryNavigation = listOf(
    NavigationItem(AppDestination.HOME, "Cockpit", Icons.Default.Dashboard),
    NavigationItem(AppDestination.AGENDA, "Agenda", Icons.Default.CalendarMonth),
    NavigationItem(AppDestination.STUDENTS, "Leerlingen", Icons.Default.Groups),
    NavigationItem(AppDestination.TASKS, "Taken", Icons.Default.TaskAlt),
    NavigationItem(AppDestination.MORE, "Meer", Icons.Default.MoreHoriz),
)

@Composable
fun InstructorApp(viewModel: InstructorViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHost.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (state.phase) {
            AuthPhase.BOOTSTRAPPING -> LoadingScreen("Je sessie wordt veilig hersteld…")
            AuthPhase.SIGNED_OUT -> LoginScreen(
                busy = state.busy,
                onLogin = viewModel::login,
            )
            AuthPhase.RECOVERABLE_ERROR -> RecoverableErrorScreen(
                busy = state.busy,
                onRetry = viewModel::retrySession,
            )
            AuthPhase.READY -> state.data?.let { data ->
                InstructorShell(
                    data = data,
                    state = state,
                    snackbarHost = snackbarHost,
                    viewModel = viewModel,
                )
            } ?: LoadingScreen("Gegevens laden…")
        }

        if (state.busy && state.phase == AuthPhase.READY) {
            Surface(
                modifier = Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(12.dp),
                shape = RoundedCornerShape(99.dp),
                tonalElevation = 6.dp,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text("Synchroniseren", style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        if (state.phase != AuthPhase.READY) {
            SnackbarHost(
                hostState = snackbarHost,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .safeDrawingPadding()
                    .padding(16.dp),
            )
        }
    }
}

@Composable
private fun LoginScreen(
    busy: Boolean,
    onLogin: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Box(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 460.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Surface(
                modifier = Modifier.size(58.dp),
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.primary,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        "N",
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
            Text(
                "Welkom terug",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Log veilig in op de native NXTDRIVE instructeursapp.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("E-mailadres") },
                leadingIcon = { Icon(Icons.Default.Person, null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Wachtwoord") },
                leadingIcon = { Icon(Icons.Default.Lock, null) },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
            )
            Button(
                onClick = { onLogin(email, password) },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Inloggen")
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Default.Lock,
                    null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.secondary,
                )
                Text(
                    "Je sessie wordt versleuteld opgeslagen in Android Keystore.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LoadingScreen(label: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RecoverableErrorScreen(
    busy: Boolean,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.Refresh, null, modifier = Modifier.size(52.dp))
        Spacer(Modifier.height(16.dp))
        Text("Sessiecontrole niet beschikbaar", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            "Je sessie is lokaal behouden. Maak verbinding en probeer opnieuw.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        Button(onClick = onRetry, enabled = !busy) { Text("Opnieuw proberen") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InstructorShell(
    data: InstructorBootstrap,
    state: InstructorUiState,
    snackbarHost: SnackbarHostState,
    viewModel: InstructorViewModel,
) {
    val isSubpage = state.destination == AppDestination.MESSAGES ||
        state.destination == AppDestination.SETTINGS
    BackHandler(enabled = isSubpage || state.selectedConversationId != null) {
        when {
            state.selectedConversationId != null -> viewModel.closeConversation()
            else -> viewModel.navigate(AppDestination.MORE)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val useRail = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            if (useRail) {
                NavigationRail(modifier = Modifier.fillMaxHeight().safeDrawingPadding()) {
                    Spacer(Modifier.height(12.dp))
                    primaryNavigation.forEach { item ->
                        NavigationRailItem(
                            selected = state.destination == item.destination,
                            onClick = { viewModel.navigate(item.destination) },
                            icon = { Icon(item.icon, item.label) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }

            Scaffold(
                modifier = Modifier.weight(1f),
                snackbarHost = { SnackbarHost(snackbarHost) },
                topBar = {
                    TopAppBar(
                        title = {
                            Column {
                                Text(destinationTitle(state.destination))
                                Text(
                                    data.profile.tenantName,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        },
                        navigationIcon = {
                            if (isSubpage) {
                                IconButton(onClick = { viewModel.navigate(AppDestination.MORE) }) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Terug")
                                }
                            }
                        },
                        actions = {
                            IconButton(onClick = viewModel::refresh, enabled = !state.busy) {
                                Icon(Icons.Default.Refresh, "Vernieuwen")
                            }
                            Surface(
                                modifier = Modifier.padding(end = 12.dp).size(36.dp),
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.primaryContainer,
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        initials(data.profile.name),
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    )
                                }
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.background,
                        ),
                    )
                },
                bottomBar = {
                    if (!useRail) {
                        NavigationBar {
                            primaryNavigation.forEach { item ->
                                NavigationBarItem(
                                    selected = state.destination == item.destination,
                                    onClick = { viewModel.navigate(item.destination) },
                                    icon = { Icon(item.icon, item.label) },
                                    label = { Text(item.label) },
                                )
                            }
                        }
                    }
                },
                floatingActionButton = {
                    when (state.destination) {
                        AppDestination.TASKS -> TaskCreateButton(data, viewModel)
                        AppDestination.AGENDA -> PlanningCreateButton(data, viewModel)
                        AppDestination.STUDENTS -> StudentCreateButton(data, viewModel)
                        else -> Unit
                    }
                },
            ) { padding ->
                Box(
                    Modifier.fillMaxSize()
                        .padding(padding)
                        .background(MaterialTheme.colorScheme.background),
                ) {
                    when (state.destination) {
                        AppDestination.HOME -> DashboardScreen(data, viewModel)
                        AppDestination.AGENDA -> AgendaScreen(data.appointments)
                        AppDestination.STUDENTS -> StudentsScreen(data.students, viewModel)
                        AppDestination.TASKS -> TasksScreen(data, viewModel)
                        AppDestination.MORE -> MoreScreen(data, viewModel)
                        AppDestination.MESSAGES -> MessagesScreen(
                            conversations = data.conversations,
                            selectedId = state.selectedConversationId,
                            onOpen = viewModel::openConversation,
                            onBack = viewModel::closeConversation,
                            onSend = viewModel::sendMessage,
                        )
                        AppDestination.SETTINGS -> SettingsScreen(
                            data = data,
                            expiresAt = state.sessionExpiresAtEpochSeconds,
                            onSwitchTenant = viewModel::switchTenant,
                            onLogout = viewModel::logout,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardScreen(data: InstructorBootstrap, viewModel: InstructorViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Text(
                "Goedendag ${data.profile.name.substringBefore(' ')}",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Dit staat er vandaag op je planning.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(data.stats) { DashboardStatCard(it) }
            }
        }
        item {
            SectionHeader("Volgende afspraken", "Agenda") {
                viewModel.navigate(AppDestination.AGENDA)
            }
            Spacer(Modifier.height(8.dp))
            if (data.appointments.isEmpty()) {
                EmptyCard("Geen afspraken in de komende periode.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.appointments.take(3).forEach { AppointmentCard(it) }
                }
            }
        }
        item {
            SectionHeader("Openstaande taken", "Alle taken") {
                viewModel.navigate(AppDestination.TASKS)
            }
            Spacer(Modifier.height(8.dp))
            if (data.tasks.isEmpty()) {
                EmptyCard("Je hebt geen openstaande taken.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.tasks.take(4).forEach { TaskCard(it) }
                }
            }
        }
        item {
            SectionHeader("Berichten", "Inbox") {
                viewModel.navigate(AppDestination.MESSAGES)
            }
            Spacer(Modifier.height(8.dp))
            if (data.conversations.isEmpty()) {
                EmptyCard("Nog geen gesprekken.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.conversations.take(3).forEach { conversation ->
                        ConversationCard(conversation) { viewModel.openConversation(conversation) }
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardStatCard(stat: DashboardStat) {
    val color = when (stat.tone) {
        "green" -> Color(0xFF0C8C65)
        "rose" -> Color(0xFFE54871)
        "purple" -> Color(0xFF8B5CF6)
        else -> MaterialTheme.colorScheme.primary
    }
    Card(
        modifier = Modifier.width(148.dp).height(112.dp),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.10f),
        ),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(stat.label, style = MaterialTheme.typography.labelLarge, color = color)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    stat.value,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(6.dp))
                Text(stat.hint, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun AgendaScreen(appointments: List<NativeAppointment>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Je planning",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Alle lessen en afspraaktypen in één native overzicht.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (appointments.isEmpty()) {
            item { EmptyCard("Er staan geen toekomstige afspraken gepland.") }
        } else {
            items(appointments, key = { it.id }) { appointment ->
                AppointmentCard(appointment)
            }
        }
    }
}

@Composable
private fun PlanningCreateButton(
    data: InstructorBootstrap,
    viewModel: InstructorViewModel,
) {
    var showDialog by remember { mutableStateOf(false) }
    ExtendedFloatingActionButton(
        onClick = { showDialog = true },
        icon = { Icon(Icons.Default.Add, null) },
        text = { Text("Inplannen") },
    )
    if (showDialog) {
        PlanningDialog(
            data = data,
            onDismiss = { showDialog = false },
            onSave = {
                viewModel.createPlanningItem(it)
                showDialog = false
            },
        )
    }
}

@Composable
private fun PlanningDialog(
    data: InstructorBootstrap,
    onDismiss: () -> Unit,
    onSave: (PlanningRequest) -> Unit,
) {
    val context = LocalContext.current
    val calendar = remember {
        Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 1) }
    }
    var type by remember { mutableStateOf("lesson") }
    var studentId by remember { mutableStateOf<String?>(null) }
    var date by remember {
        mutableStateOf(
            String.format(
                Locale.ROOT,
                "%04d-%02d-%02d",
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH) + 1,
                calendar.get(Calendar.DAY_OF_MONTH),
            ),
        )
    }
    var time by remember { mutableStateOf("09:00") }
    var duration by remember { mutableStateOf(60) }
    var buffer by remember { mutableStateOf(0) }
    var title by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var vehicleId by remember { mutableStateOf<String?>(null) }
    var typeMenu by remember { mutableStateOf(false) }
    var studentMenu by remember { mutableStateOf(false) }
    var vehicleMenu by remember { mutableStateOf(false) }
    val needsStudent = type in setOf(
        "lesson",
        "exam",
        "interim_test",
        "theory_guidance",
    )
    val typeOptions = listOf(
        "lesson" to "Rijles",
        "exam" to "Examen",
        "interim_test" to "Tussentijdse toets",
        "theory_guidance" to "Theoriebegeleiding",
        "free_block" to "Vrij blok",
        "break" to "Pauze",
        "private_block" to "Privéblokkade",
        "maintenance" to "Onderhoud",
        "admin" to "Administratie",
        "vacation" to "Vakantie",
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nieuwe planning") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box {
                    OutlinedButton(
                        onClick = { typeMenu = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(typeOptions.first { it.first == type }.second)
                    }
                    androidx.compose.material3.DropdownMenu(
                        expanded = typeMenu,
                        onDismissRequest = { typeMenu = false },
                    ) {
                        typeOptions.forEach { option ->
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text(option.second) },
                                onClick = {
                                    type = option.first
                                    if (type !in setOf(
                                            "lesson",
                                            "exam",
                                            "interim_test",
                                            "theory_guidance",
                                        )
                                    ) {
                                        studentId = null
                                    }
                                    typeMenu = false
                                },
                            )
                        }
                    }
                }
                if (needsStudent) {
                    Box {
                        OutlinedButton(
                            onClick = { studentMenu = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                data.students.firstOrNull { it.id == studentId }?.name
                                    ?: "Kies leerling",
                            )
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = studentMenu,
                            onDismissRequest = { studentMenu = false },
                        ) {
                            data.students.forEach { student ->
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text(student.name) },
                                    onClick = {
                                        studentId = student.id
                                        studentMenu = false
                                    },
                                )
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            val parts = date.split("-").mapNotNull(String::toIntOrNull)
                            android.app.DatePickerDialog(
                                context,
                                { _, year, month, day ->
                                    date = String.format(
                                        Locale.ROOT,
                                        "%04d-%02d-%02d",
                                        year,
                                        month + 1,
                                        day,
                                    )
                                },
                                parts.getOrElse(0) { calendar.get(Calendar.YEAR) },
                                parts.getOrElse(1) {
                                    calendar.get(Calendar.MONTH) + 1
                                } - 1,
                                parts.getOrElse(2) {
                                    calendar.get(Calendar.DAY_OF_MONTH)
                                },
                            ).show()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.CalendarMonth, null)
                        Spacer(Modifier.width(6.dp))
                        Text(formatDateOnly(date))
                    }
                    OutlinedButton(
                        onClick = {
                            val parts = time.split(":").mapNotNull(String::toIntOrNull)
                            android.app.TimePickerDialog(
                                context,
                                { _, hour, minute ->
                                    time = String.format(
                                        Locale.ROOT,
                                        "%02d:%02d",
                                        hour,
                                        minute,
                                    )
                                },
                                parts.getOrElse(0) { 9 },
                                parts.getOrElse(1) { 0 },
                                true,
                            ).show()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.Schedule, null)
                        Spacer(Modifier.width(6.dp))
                        Text(time)
                    }
                }
                Text("Duur", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf(30, 45, 60, 90, 120)) { minutes ->
                        FilterChip(
                            selected = duration == minutes,
                            onClick = { duration = minutes },
                            label = { Text("$minutes min") },
                        )
                    }
                }
                Text("Buffer", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf(0, 10, 20, 30)) { minutes ->
                        FilterChip(
                            selected = buffer == minutes,
                            onClick = { buffer = minutes },
                            label = { Text(if (minutes == 0) "Geen" else "$minutes min") },
                        )
                    }
                }
                if (type != "lesson") {
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it.take(200) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Titel (optioneel)") },
                        singleLine = true,
                    )
                }
                OutlinedTextField(
                    value = location,
                    onValueChange = { location = it.take(200) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Locatie") },
                    singleLine = true,
                )
                if (data.vehicles.isNotEmpty()) {
                    Box {
                        OutlinedButton(
                            onClick = { vehicleMenu = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                data.vehicles.firstOrNull { it.id == vehicleId }?.label
                                    ?: "Geen voertuig gekozen",
                            )
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = vehicleMenu,
                            onDismissRequest = { vehicleMenu = false },
                        ) {
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text("Geen voertuig") },
                                onClick = {
                                    vehicleId = null
                                    vehicleMenu = false
                                },
                            )
                            data.vehicles.forEach { vehicle ->
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text(vehicle.label) },
                                    onClick = {
                                        vehicleId = vehicle.id
                                        vehicleMenu = false
                                    },
                                )
                            }
                        }
                    }
                }
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it.take(1000) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Notities") },
                    minLines = 2,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        PlanningRequest(
                            type = type,
                            studentId = if (needsStudent) studentId else null,
                            startsAtLocal = "${date}T${time}:00",
                            durationMinutes = duration,
                            bufferMinutes = buffer,
                            title = title.trim().ifBlank { null },
                            location = location.trim().ifBlank { null },
                            notes = notes.trim().ifBlank { null },
                            vehicleId = vehicleId,
                        ),
                    )
                },
                enabled = !needsStudent || studentId != null,
            ) { Text("Inplannen") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuleren") } },
    )
}

@Composable
private fun AppointmentCard(appointment: NativeAppointment) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(46.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        if (appointment.kind == "lesson") Icons.Default.DirectionsCar
                        else Icons.Default.CalendarMonth,
                        null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
            Column(Modifier.weight(1f)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        appointment.title,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        formatIso(appointment.startsAt, "HH:mm"),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                appointment.studentName?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "${formatIso(appointment.startsAt, "EEE d MMM")} · " +
                        "${formatIso(appointment.startsAt, "HH:mm")}–" +
                        formatIso(appointment.endsAt, "HH:mm"),
                    style = MaterialTheme.typography.bodySmall,
                )
                appointment.location?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun StudentsScreen(
    students: List<NativeStudent>,
    viewModel: InstructorViewModel,
) {
    var query by remember { mutableStateOf("") }
    var creditStudent by remember { mutableStateOf<NativeStudent?>(null) }
    val filtered = students.filter {
        query.isBlank() || it.name.contains(query, ignoreCase = true) ||
            it.email?.contains(query, ignoreCase = true) == true
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Leerlingen",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Zoek op naam of e-mail") },
                singleLine = true,
            )
        }
        if (filtered.isEmpty()) {
            item { EmptyCard("Geen leerlingen gevonden.") }
        } else {
            items(filtered, key = { it.id }) { student ->
                StudentCard(student, onAddCredits = { creditStudent = student })
            }
        }
    }
    creditStudent?.let { student ->
        CreditDialog(
            student = student,
            onDismiss = { creditStudent = null },
            onSave = { hours, note ->
                viewModel.addStudentCredits(student, hours, note)
                creditStudent = null
            },
        )
    }
}

@Composable
private fun StudentCreateButton(
    data: InstructorBootstrap,
    viewModel: InstructorViewModel,
) {
    var showDialog by remember { mutableStateOf(false) }
    ExtendedFloatingActionButton(
        onClick = { showDialog = true },
        icon = { Icon(Icons.Default.Add, null) },
        text = { Text("Leerling toevoegen") },
    )
    if (showDialog) {
        StudentCreateDialog(
            ris20Qualified = data.profile.ris20Qualified,
            onDismiss = { showDialog = false },
            onSave = {
                viewModel.createStudent(it)
                showDialog = false
            },
        )
    }
}

@Composable
private fun StudentCreateDialog(
    ris20Qualified: Boolean,
    onDismiss: () -> Unit,
    onSave: (StudentCreateRequest) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var postcode by remember { mutableStateOf("") }
    var birthDate by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var pickupAddress by remember { mutableStateOf("") }
    var startDate by remember { mutableStateOf("") }
    var educationType by remember {
        mutableStateOf(if (ris20Qualified) "RIS_2_0" else "STANDARD")
    }
    var privacyConfirmed by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Leerling toevoegen") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "E-mail is optioneel. Met een echt e-mailadres wordt direct " +
                        "een portaalaccount aangemaakt.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(200) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Naam") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.take(320) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("E-mailadres (optioneel)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.take(30) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Telefoon") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = postcode,
                    onValueChange = { postcode = it.take(10) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Postcode") },
                    singleLine = true,
                )
                Text("Opleidingstype", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = educationType == "STANDARD",
                        onClick = { educationType = "STANDARD" },
                        label = { Text("Regulier") },
                    )
                    FilterChip(
                        selected = educationType == "RIS_2_0",
                        onClick = { if (ris20Qualified) educationType = "RIS_2_0" },
                        enabled = ris20Qualified,
                        label = { Text("RIS 2.0") },
                    )
                }
                if (ris20Qualified) {
                    Text(
                        "RIS 2.0 is standaard geselecteerd vanwege je kwalificatie.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
                OutlinedTextField(
                    value = birthDate,
                    onValueChange = { birthDate = it.take(10) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Geboortedatum (jjjj-mm-dd)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = startDate,
                    onValueChange = { startDate = it.take(10) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Gewenste startdatum (jjjj-mm-dd)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it.take(240) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Adres") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = city,
                    onValueChange = { city = it.take(160) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Woonplaats") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = pickupAddress,
                    onValueChange = { pickupAddress = it.take(240) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Ophaaladres") },
                    singleLine = true,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                ) {
                    Checkbox(
                        checked = privacyConfirmed,
                        onCheckedChange = { privacyConfirmed = it },
                    )
                    Column(Modifier.padding(top = 10.dp)) {
                        Text("Privacyproces bevestigd", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Ik leg alleen noodzakelijke gegevens vast die volgens het " +
                                "afgesproken proces zijn ontvangen.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        StudentCreateRequest(
                            displayName = name.trim(),
                            email = email.trim().ifBlank { null },
                            phone = phone.trim().ifBlank { null },
                            postcode = postcode.trim().ifBlank { null },
                            birthDate = birthDate.trim().ifBlank { null },
                            addressLine = address.trim().ifBlank { null },
                            city = city.trim().ifBlank { null },
                            pickupAddress = pickupAddress.trim().ifBlank { null },
                            educationType = educationType,
                            startDate = startDate.trim().ifBlank { null },
                            privacyConfirmed = privacyConfirmed,
                        ),
                    )
                },
                enabled = name.isNotBlank() && privacyConfirmed,
            ) { Text("Aanmaken") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuleren") } },
    )
}

@Composable
private fun StudentCard(
    student: NativeStudent,
    onAddCredits: (() -> Unit)? = null,
) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(44.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(initials(student.name), fontWeight = FontWeight.Bold)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(student.name, fontWeight = FontWeight.SemiBold)
                Text(
                    student.email ?: student.phone ?: "Geen contactgegevens",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "${student.completedLessons} afgeronde lessen",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    student.nextLessonAt?.let {
                        "Volgende les ${formatIso(it, "EEE d MMM, HH:mm")}"
                    } ?: "Geen vervolgles gepland",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Surface(
                shape = RoundedCornerShape(99.dp),
                color = if (student.creditMinutes <= 300) {
                    MaterialTheme.colorScheme.errorContainer
                } else {
                    MaterialTheme.colorScheme.secondaryContainer
                },
            ) {
                Text(
                    "${student.creditMinutes / 60}u ${student.creditMinutes % 60}m",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            onAddCredits?.let {
                IconButton(onClick = it) {
                    Icon(Icons.Default.Add, "Lestegoed toevoegen")
                }
            }
        }
    }
}

@Composable
private fun CreditDialog(
    student: NativeStudent,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    var hours by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val parsedHours = hours.replace(',', '.').toDoubleOrNull()
    val valid = parsedHours != null &&
        parsedHours in 0.25..100.0 &&
        parsedHours * 4 == kotlin.math.floor(parsedHours * 4) &&
        note.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Lestegoed toevoegen") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "${student.name} heeft momenteel " +
                        "${student.creditMinutes / 60}u ${student.creditMinutes % 60}m.",
                )
                OutlinedTextField(
                    value = hours,
                    onValueChange = { hours = it.take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Aantal uur") },
                    supportingText = { Text("Stappen van 0,25 uur") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(200) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Reden") },
                    minLines = 2,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(parsedHours!!, note.trim()) },
                enabled = valid,
            ) { Text("Toevoegen") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuleren") } },
    )
}

@Composable
private fun TasksScreen(data: InstructorBootstrap, viewModel: InstructorViewModel) {
    var editingTask by remember { mutableStateOf<NativeTask?>(null) }
    var deletingTask by remember { mutableStateOf<NativeTask?>(null) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 100.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Openstaande taken",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Toevoegen, bewerken, verwijderen en koppelen aan een leerling.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (data.tasks.isEmpty()) {
            item { EmptyCard("Alles is bijgewerkt. Er zijn geen openstaande taken.") }
        } else {
            items(data.tasks, key = { it.id }) { task ->
                TaskCard(
                    task = task,
                    onEdit = { editingTask = task },
                    onDelete = { deletingTask = task },
                )
            }
        }
    }
    editingTask?.let { task ->
        TaskEditorDialog(
            title = "Taak bewerken",
            initial = task,
            students = data.students,
            onDismiss = { editingTask = null },
            onSave = {
                viewModel.updateTask(task, it)
                editingTask = null
            },
        )
    }
    deletingTask?.let { task ->
        AlertDialog(
            onDismissRequest = { deletingTask = null },
            title = { Text("Taak verwijderen?") },
            text = { Text("‘${task.title}’ wordt uit je openstaande taken verwijderd.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteTask(task)
                        deletingTask = null
                    },
                ) { Text("Verwijderen") }
            },
            dismissButton = {
                TextButton(onClick = { deletingTask = null }) { Text("Annuleren") }
            },
        )
    }
}

@Composable
private fun TaskCard(
    task: NativeTask,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
) {
    val priorityColor = when (task.priority) {
        "urgent" -> MaterialTheme.colorScheme.error
        "high" -> Color(0xFFE07A12)
        "low" -> Color(0xFF3588C7)
        else -> MaterialTheme.colorScheme.primary
    }
    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                Modifier.size(10.dp).background(priorityColor, CircleShape),
            )
            Column(Modifier.weight(1f)) {
                Text(task.title, fontWeight = FontWeight.SemiBold)
                task.description?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    listOfNotNull(
                        task.studentName,
                        task.dueDate?.let { "Deadline ${formatDateOnly(it)}" },
                    ).joinToString(" · ").ifBlank { "Geen deadline" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            onEdit?.let {
                IconButton(onClick = it) { Icon(Icons.Default.Edit, "Bewerken") }
            }
            onDelete?.let {
                IconButton(onClick = it) { Icon(Icons.Default.Delete, "Verwijderen") }
            }
        }
    }
}

@Composable
private fun TaskCreateButton(data: InstructorBootstrap, viewModel: InstructorViewModel) {
    var showDialog by remember { mutableStateOf(false) }
    ExtendedFloatingActionButton(
        onClick = { showDialog = true },
        icon = { Icon(Icons.Default.Add, null) },
        text = { Text("Taak toevoegen") },
    )
    if (showDialog) {
        TaskEditorDialog(
            title = "Nieuwe taak",
            students = data.students,
            onDismiss = { showDialog = false },
            onSave = {
                viewModel.createTask(it)
                showDialog = false
            },
        )
    }
}

@Composable
private fun TaskEditorDialog(
    title: String,
    students: List<NativeStudent>,
    initial: NativeTask? = null,
    onDismiss: () -> Unit,
    onSave: (TaskMutationRequest) -> Unit,
) {
    var taskTitle by remember(initial) { mutableStateOf(initial?.title.orEmpty()) }
    var description by remember(initial) { mutableStateOf(initial?.description.orEmpty()) }
    var dueDate by remember(initial) { mutableStateOf(initial?.dueDate.orEmpty()) }
    var priority by remember(initial) { mutableStateOf(initial?.priority ?: "normal") }
    var studentId by remember(initial) { mutableStateOf(initial?.studentId) }
    var showStudents by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = taskTitle,
                    onValueChange = { taskTitle = it.take(200) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Titel") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(4000) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Omschrijving") },
                    minLines = 2,
                )
                OutlinedTextField(
                    value = dueDate,
                    onValueChange = { dueDate = it.take(10) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Deadline (jjjj-mm-dd)") },
                    singleLine = true,
                )
                Text("Prioriteit", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf("low", "normal", "high", "urgent")) { value ->
                        FilterChip(
                            selected = priority == value,
                            onClick = { priority = value },
                            label = { Text(priorityLabel(value)) },
                        )
                    }
                }
                Box {
                    OutlinedButton(
                        onClick = { showStudents = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            students.firstOrNull { it.id == studentId }?.name
                                ?: "Geen leerling gekoppeld",
                        )
                    }
                    androidx.compose.material3.DropdownMenu(
                        expanded = showStudents,
                        onDismissRequest = { showStudents = false },
                    ) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("Geen leerling") },
                            onClick = {
                                studentId = null
                                showStudents = false
                            },
                        )
                        students.forEach { student ->
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text(student.name) },
                                onClick = {
                                    studentId = student.id
                                    showStudents = false
                                },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        TaskMutationRequest(
                            title = taskTitle.trim(),
                            description = description.trim().ifBlank { null },
                            priority = priority,
                            dueDate = dueDate.trim().ifBlank { null },
                            studentId = studentId,
                        ),
                    )
                },
                enabled = taskTitle.isNotBlank(),
            ) { Text("Opslaan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuleren") } },
    )
}

@Composable
private fun MoreScreen(data: InstructorBootstrap, viewModel: InstructorViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Meer",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }
        item {
            MoreItem(
                icon = Icons.Default.Mail,
                title = "Berichten",
                subtitle = "${data.conversations.sumOf { it.unreadCount }} ongelezen",
            ) { viewModel.navigate(AppDestination.MESSAGES) }
        }
        item {
            MoreItem(
                icon = Icons.Default.DirectionsCar,
                title = "Voertuigen",
                subtitle = "${data.vehicles.size} voertuigen beschikbaar",
            )
        }
        item {
            MoreItem(
                icon = Icons.Default.Schedule,
                title = "Beschikbaarheid",
                subtitle = data.availability.firstOrNull()?.intervalLabel
                    ?: "Geen schema ingesteld",
            )
        }
        item {
            MoreItem(
                icon = Icons.Default.Settings,
                title = "Instellingen en sessies",
                subtitle = "Account, vestiging en beveiliging",
            ) { viewModel.navigate(AppDestination.SETTINGS) }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Text("Voertuigen", style = MaterialTheme.typography.titleMedium)
        }
        items(data.vehicles, key = { it.id }) { vehicle ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(vehicle.label) },
                    supportingContent = {
                        Text(
                            listOfNotNull(
                                vehicle.licensePlate,
                                vehicle.transmission,
                                vehicle.status,
                            ).joinToString(" · "),
                        )
                    },
                    leadingContent = { Icon(Icons.Default.DirectionsCar, null) },
                )
            }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Text("Beschikbaarheid", style = MaterialTheme.typography.titleMedium)
        }
        items(data.availability, key = { it.date }) { day ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("${day.label} · ${formatDateOnly(day.date)}") },
                    supportingContent = { Text(day.intervalLabel) },
                    trailingContent = {
                        Text(
                            if (day.active) "${day.availableMinutes / 60}u" else "Vrij",
                            color = if (day.active) {
                                MaterialTheme.colorScheme.secondary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun MoreItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: (() -> Unit)? = null,
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick ?: {},
        enabled = onClick != null,
    ) {
        ListItem(
            headlineContent = { Text(title, fontWeight = FontWeight.SemiBold) },
            supportingContent = { Text(subtitle) },
            leadingContent = { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) },
        )
    }
}

@Composable
private fun MessagesScreen(
    conversations: List<NativeConversation>,
    selectedId: String?,
    onOpen: (NativeConversation) -> Unit,
    onBack: () -> Unit,
    onSend: (NativeConversation, String) -> Unit,
) {
    val selected = conversations.firstOrNull { it.id == selectedId }
    if (selected == null) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    "Berichten",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
            if (conversations.isEmpty()) {
                item { EmptyCard("Nog geen gesprekken.") }
            } else {
                items(conversations, key = { it.id }) { conversation ->
                    ConversationCard(conversation) { onOpen(conversation) }
                }
            }
        }
        return
    }

    var message by remember(selected.id) { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(selected.messages.size) {
        if (selected.messages.isNotEmpty()) {
            listState.animateScrollToItem(selected.messages.lastIndex)
        }
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        ListItem(
            headlineContent = { Text(selected.studentName, fontWeight = FontWeight.Bold) },
            supportingContent = { Text("Leerling") },
            leadingContent = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Gesprekken")
                }
            },
        )
        HorizontalDivider()
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(selected.messages, key = { it.id }) { chat ->
                val mine = chat.sender == "instructor"
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                ) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(0.82f),
                        shape = RoundedCornerShape(
                            topStart = 18.dp,
                            topEnd = 18.dp,
                            bottomStart = if (mine) 18.dp else 4.dp,
                            bottomEnd = if (mine) 4.dp else 18.dp,
                        ),
                        color = if (mine) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(chat.body)
                            Text(
                                formatIso(chat.createdAt, "HH:mm"),
                                modifier = Modifier.align(Alignment.End),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = message,
                onValueChange = { message = it.take(4000) },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Typ een bericht…") },
                maxLines = 4,
            )
            FloatingActionButton(
                onClick = {
                    onSend(selected, message)
                    message = ""
                },
                modifier = Modifier.size(52.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, "Versturen")
            }
        }
    }
}

@Composable
private fun ConversationCard(
    conversation: NativeConversation,
    onClick: () -> Unit,
) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        ListItem(
            headlineContent = {
                Text(conversation.studentName, fontWeight = FontWeight.SemiBold)
            },
            supportingContent = {
                Text(
                    conversation.preview ?: "Nog geen berichten",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            },
            leadingContent = {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(initials(conversation.studentName), fontWeight = FontWeight.Bold)
                    }
                }
            },
            trailingContent = {
                Column(horizontalAlignment = Alignment.End) {
                    conversation.lastMessageAt?.let {
                        Text(formatIso(it, "HH:mm"), style = MaterialTheme.typography.labelSmall)
                    }
                    if (conversation.unreadCount > 0) {
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary) {
                            Text(
                                conversation.unreadCount.toString(),
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            },
        )
    }
}

@Composable
private fun SettingsScreen(
    data: InstructorBootstrap,
    expiresAt: Long?,
    onSwitchTenant: (String, String) -> Unit,
    onLogout: (Boolean) -> Unit,
) {
    var confirmEverywhere by remember { mutableStateOf(false) }
    val uriHandler = LocalUriHandler.current
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "Account",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }
        item {
            OutlinedCard(Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(data.profile.name) },
                    supportingContent = { Text(data.profile.email) },
                    leadingContent = { Icon(Icons.Default.Person, null) },
                    trailingContent = {
                        if (data.profile.ris20Qualified) {
                            Icon(
                                Icons.Default.CheckCircle,
                                "RIS 2.0 gekwalificeerd",
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    },
                )
            }
        }
        if (data.tenants.size > 1) {
            item { Text("Rijschool", style = MaterialTheme.typography.titleMedium) }
            items(data.tenants, key = { it.id }) { tenant ->
                OutlinedButton(
                    onClick = { onSwitchTenant(tenant.id, tenant.name) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = tenant.id != data.profile.activeTenantId,
                ) {
                    Text(tenant.name)
                }
            }
        }
        item { Text("Sessiebeheer", style = MaterialTheme.typography.titleMedium) }
        item {
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Default.Lock, null, tint = MaterialTheme.colorScheme.secondary)
                        Column {
                            Text("Beveiligde native sessie", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Tokens staan versleuteld in Android Keystore en worden automatisch vernieuwd.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    expiresAt?.let {
                        Text(
                            "Huidige toegang geldig tot ${formatEpoch(it)}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
        item {
            OutlinedButton(
                onClick = { onLogout(false) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, null)
                Spacer(Modifier.width(8.dp))
                Text("Uitloggen op dit apparaat")
            }
        }
        item {
            Button(
                onClick = { confirmEverywhere = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Lock, null)
                Spacer(Modifier.width(8.dp))
                Text("Alle sessies uitloggen")
            }
        }
        item {
            Text("Privacy en gegevens", style = MaterialTheme.typography.titleMedium)
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        "Lees welke gegevens worden verwerkt of start een verwijderingsverzoek. " +
                            "De links openen de openbare NXTDRIVE-website.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(
                        onClick = {
                            uriHandler.openUri(LegalLinks.PRIVACY_POLICY)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Lock, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Privacybeleid")
                    }
                    OutlinedButton(
                        onClick = {
                            uriHandler.openUri(LegalLinks.ACCOUNT_DELETION)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Delete, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Account en gegevens verwijderen")
                    }
                }
            }
        }
        item {
            Text("Appinformatie", style = MaterialTheme.typography.titleMedium)
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Versie ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                    Text("Kanaal ${BuildConfig.RELEASE_CHANNEL}")
                    Text("Commit ${BuildConfig.GIT_SHA}")
                    Text(
                        "Volledig native Kotlin + Jetpack Compose",
                        color = MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
    if (confirmEverywhere) {
        AlertDialog(
            onDismissRequest = { confirmEverywhere = false },
            title = { Text("Overal uitloggen?") },
            text = {
                Text(
                    "Alle actieve NXTDRIVE-sessies van dit account worden ingetrokken. " +
                        "Je moet daarna op ieder apparaat opnieuw inloggen.",
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmEverywhere = false
                        onLogout(true)
                    },
                ) { Text("Alle sessies uitloggen") }
            },
            dismissButton = {
                TextButton(onClick = { confirmEverywhere = false }) { Text("Annuleren") }
            },
        )
    }
}

@Composable
private fun SectionHeader(title: String, action: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        TextButton(onClick = onClick) { Text(action) }
    }
}

@Composable
private fun EmptyCard(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Text(
            message,
            modifier = Modifier.padding(18.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun destinationTitle(destination: AppDestination) = when (destination) {
    AppDestination.HOME -> "Cockpit"
    AppDestination.AGENDA -> "Agenda"
    AppDestination.STUDENTS -> "Leerlingen"
    AppDestination.TASKS -> "Taken"
    AppDestination.MORE -> "Meer"
    AppDestination.MESSAGES -> "Berichten"
    AppDestination.SETTINGS -> "Instellingen"
}

private fun initials(name: String): String =
    name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }
        .ifBlank { "NX" }

private fun priorityLabel(priority: String) = when (priority) {
    "low" -> "Laag"
    "high" -> "Hoog"
    "urgent" -> "Urgent"
    else -> "Normaal"
}

private fun formatDateOnly(value: String): String {
    val input = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
        isLenient = false
    }
    val output = SimpleDateFormat("d MMM yyyy", Locale.forLanguageTag("nl-NL"))
    return runCatching { output.format(input.parse(value) ?: return value) }.getOrDefault(value)
}

private fun formatIso(value: String, outputPattern: String): String {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )
    val parsed = patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.ROOT).apply {
                isLenient = false
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(value)
        }.getOrNull()
    } ?: return value
    return SimpleDateFormat(outputPattern, Locale.forLanguageTag("nl-NL")).format(parsed)
}

private fun formatEpoch(epochSeconds: Long): String =
    SimpleDateFormat("d MMM yyyy, HH:mm", Locale.forLanguageTag("nl-NL"))
        .format(Date(epochSeconds * 1_000L))
