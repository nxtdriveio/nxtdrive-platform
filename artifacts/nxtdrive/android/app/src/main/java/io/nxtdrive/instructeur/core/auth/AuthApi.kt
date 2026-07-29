package io.nxtdrive.instructeur.core.auth

import io.nxtdrive.instructeur.core.model.ApiSuccess
import io.nxtdrive.instructeur.core.model.AuthSessionEnvelope
import io.nxtdrive.instructeur.core.model.LoginRequest
import io.nxtdrive.instructeur.core.model.LogoutRequest
import io.nxtdrive.instructeur.core.model.RefreshRequest
import io.nxtdrive.instructeur.core.network.NativeApiClient

interface AuthRemoteDataSource {
    suspend fun login(email: String, password: String): AuthSessionEnvelope
    suspend fun refresh(refreshToken: String, tenantId: String): AuthSessionEnvelope
    suspend fun logout(
        session: io.nxtdrive.instructeur.core.model.NativeSession,
        everywhere: Boolean,
    )
}

class AuthApi(
    private val api: NativeApiClient,
) : AuthRemoteDataSource {
    override suspend fun login(email: String, password: String): AuthSessionEnvelope {
        val response = api.execute(
            path = "/api/mobile/auth/login",
            method = "POST",
            body = api.json.encodeToString(LoginRequest.serializer(), LoginRequest(email, password)),
        )
        return api.json.decodeFromString(AuthSessionEnvelope.serializer(), response)
    }

    override suspend fun refresh(refreshToken: String, tenantId: String): AuthSessionEnvelope {
        val response = api.execute(
            path = "/api/mobile/auth/refresh",
            method = "POST",
            body = api.json.encodeToString(
                RefreshRequest.serializer(),
                RefreshRequest(refreshToken, tenantId),
            ),
        )
        return api.json.decodeFromString(AuthSessionEnvelope.serializer(), response)
    }

    override suspend fun logout(
        session: io.nxtdrive.instructeur.core.model.NativeSession,
        everywhere: Boolean,
    ) {
        val response = api.execute(
            path = "/api/mobile/auth/logout",
            method = "POST",
            accessToken = session.accessToken,
            body = api.json.encodeToString(
                LogoutRequest.serializer(),
                LogoutRequest(session.refreshToken, everywhere),
            ),
        )
        api.json.decodeFromString(ApiSuccess.serializer(), response)
    }
}
