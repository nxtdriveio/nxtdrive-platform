package io.nxtdrive.instructeur

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import io.nxtdrive.instructeur.ui.InstructorApp
import io.nxtdrive.instructeur.ui.InstructorViewModel
import io.nxtdrive.instructeur.ui.theme.NxtDriveTheme

class MainActivity : ComponentActivity() {
    private val viewModel: InstructorViewModel by viewModels {
        InstructorViewModel.factory((application as NxtDriveApplication).container)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        viewModel.handleDeepLink(intent?.data)

        setContent {
            NxtDriveTheme {
                InstructorApp(viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.handleDeepLink(intent.data)
    }
}
