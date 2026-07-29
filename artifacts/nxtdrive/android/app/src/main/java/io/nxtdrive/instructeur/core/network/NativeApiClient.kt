package io.nxtdrive.instructeur.core.network

import io.nxtdrive.instructeur.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

@Serializable
private data class ApiErrorPayload(
    val error: String? = null,
    val code: String? = null,
)

class ApiException(
    val statusCode: Int,
    val errorCode: String?,
    override val message: String,
) : IOException(message)

class NativeApiClient(
    baseUrl: String,
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build(),
) {
    private val root = baseUrl.trimEnd('/')
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun execute(
        path: String,
        method: String = "GET",
        body: String? = null,
        accessToken: String? = null,
        tenantId: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val requestBuilder = Request.Builder()
            .url("$root${normalizePath(path)}")
            .header("Accept", "application/json")
            .header(
                "X-NXTDRIVE-Client",
                "android/${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            )

        if (accessToken != null) {
            requestBuilder.header("Authorization", "Bearer $accessToken")
        }
        if (tenantId != null) {
            requestBuilder.header("X-NXTDRIVE-Tenant-ID", tenantId)
        }

        val requestBody = body?.toRequestBody(jsonMediaType)
        when (method) {
            "GET" -> requestBuilder.get()
            "POST" -> requestBuilder.post(requestBody ?: "{}".toRequestBody(jsonMediaType))
            "PATCH" -> requestBuilder.patch(requestBody ?: "{}".toRequestBody(jsonMediaType))
            "DELETE" -> requestBuilder.delete(requestBody)
            else -> error("Unsupported HTTP method: $method")
        }

        client.newCall(requestBuilder.build()).execute().use { response ->
            val responseBody = response.body.string()
            if (response.isSuccessful) return@withContext responseBody

            val payload = runCatching {
                json.decodeFromString<ApiErrorPayload>(responseBody)
            }.getOrNull()
            throw ApiException(
                statusCode = response.code,
                errorCode = payload?.code,
                message = payload?.error
                    ?: "De server gaf een onverwacht antwoord (${response.code}).",
            )
        }
    }

    private fun normalizePath(path: String) =
        if (path.startsWith('/')) path else "/$path"
}
