package io.nxtdrive.instructeur

import android.app.Application
import io.nxtdrive.instructeur.core.AppContainer

class NxtDriveApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
