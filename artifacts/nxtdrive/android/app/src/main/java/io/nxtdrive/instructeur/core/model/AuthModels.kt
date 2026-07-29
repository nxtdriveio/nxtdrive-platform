package io.nxtdrive.instructeur.core.model

import kotlinx.serialization.Serializable

@Serializable
data class NativeSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
    val email: String,
    val activeTenantId: String,
    val activeTenantName: String,
)

@Serializable
data class AuthSessionEnvelope(
    val session: AuthTokenPayload,
    val user: AuthUserPayload,
    val tenant: TenantSummary,
)

@Serializable
data class AuthTokenPayload(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
)

@Serializable
data class AuthUserPayload(
    val id: String,
    val email: String,
)

@Serializable
data class TenantSummary(
    val id: String,
    val name: String,
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
    val tenantId: String? = null,
)

@Serializable
data class LogoutRequest(
    val refreshToken: String,
    val everywhere: Boolean,
)

fun AuthSessionEnvelope.toNativeSession() = NativeSession(
    accessToken = session.accessToken,
    refreshToken = session.refreshToken,
    expiresAtEpochSeconds = session.expiresAtEpochSeconds,
    userId = user.id,
    email = user.email,
    activeTenantId = tenant.id,
    activeTenantName = tenant.name,
)
