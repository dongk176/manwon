package com.manwon.app

import android.content.Context
import android.net.Uri

object AppConfig {
    private const val FALLBACK_WEB_BASE_URL = "https://manwonmvp.vercel.app"

    fun webBaseUrl(context: Context): String {
        val appInfo = context.packageManager.getApplicationInfo(
            context.packageName,
            android.content.pm.PackageManager.GET_META_DATA
        )
        val configured = appInfo.metaData?.getString("ManwonWebBaseURL")?.trim().orEmpty()
        return configured.ifEmpty { FALLBACK_WEB_BASE_URL }.trimEnd('/')
    }

    fun webUrl(context: Context, path: String): String {
        val trimmed = path.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
        val normalized = if (trimmed.startsWith("/")) trimmed else "/$trimmed"
        return webBaseUrl(context) + normalized
    }

    fun pathWithQuery(uri: Uri): String {
        val path = uri.encodedPath?.ifEmpty { "/" } ?: "/"
        val query = uri.encodedQuery
        return if (query.isNullOrBlank()) path else "$path?$query"
    }

    fun isAllowedHost(context: Context, host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        val baseHost = Uri.parse(webBaseUrl(context)).host.orEmpty()
        return host == baseHost || host == "localhost" || host == "127.0.0.1"
    }

    fun isNativeRoute(path: String): Boolean {
        return path == "/chat" || path.startsWith("/chat/") || path == "/activity" || path.startsWith("/activity/") || path == "/nearby" || path.startsWith("/nearby/")
    }
}
