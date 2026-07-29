package io.nxtdrive.instructeur.core

import android.content.Context
import io.nxtdrive.instructeur.BuildConfig
import io.nxtdrive.instructeur.core.auth.AuthApi
import io.nxtdrive.instructeur.core.auth.SecureSessionStore
import io.nxtdrive.instructeur.core.auth.SessionManager
import io.nxtdrive.instructeur.core.network.NativeApiClient
import io.nxtdrive.instructeur.data.InstructorRepository

class AppContainer(context: Context) {
    private val api = NativeApiClient(BuildConfig.API_BASE_URL)
    private val authApi = AuthApi(api)
    private val sessionStore = SecureSessionStore(context.applicationContext, api.json)

    val sessionManager = SessionManager(sessionStore, authApi)
    val instructorRepository = InstructorRepository(api, sessionManager)
}
