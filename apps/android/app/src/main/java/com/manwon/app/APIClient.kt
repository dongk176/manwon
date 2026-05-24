package com.manwon.app

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class APIClient(private val context: Context) {
    class APIError(message: String) : Exception(message)

    fun fetchSession(): SessionState {
        return parseSession(requestObject("/api/auth/session"))
    }

    fun fetchConversations(): List<Conversation> {
        return requestArray("/api/conversations").map { parseConversation(it) }
    }

    fun fetchMessages(conversationId: String): List<Message> {
        return requestArray("/api/conversations/$conversationId/messages").map { parseMessage(it) }
    }

    fun markConversationRead(conversationId: String) {
        requestUnit("/api/conversations/$conversationId/read", "PATCH")
    }

    fun sendTextMessage(conversationId: String, body: String, clientMessageId: String): Message {
        val payload = JSONObject()
            .put("messageType", "text")
            .put("body", body)
            .put("clientMessageId", clientMessageId)
        return parseMessage(requestObject("/api/conversations/$conversationId/messages", "POST", payload))
    }

    fun sendImageMessage(conversationId: String, imageUrl: String, clientMessageId: String): Message {
        val payload = JSONObject()
            .put("messageType", "image")
            .put("imageUrl", imageUrl)
            .put("clientMessageId", clientMessageId)
        return parseMessage(requestObject("/api/conversations/$conversationId/messages", "POST", payload))
    }

    fun updateDealStatus(dealId: String, status: String, reportReason: String? = null, reportDescription: String? = null) {
        val payload = JSONObject().put("status", status)
        if (!reportReason.isNullOrBlank()) payload.put("reportReason", reportReason)
        if (!reportDescription.isNullOrBlank()) payload.put("reportDescription", reportDescription)
        requestUnit("/api/deals/$dealId/status", "PATCH", payload)
    }

    fun updateApplicationStatus(applicationId: String, status: String) {
        requestUnit("/api/applications/$applicationId/status", "PATCH", JSONObject().put("status", status))
    }

    fun fetchNearbyPosts(latitude: Double, longitude: Double, radiusM: Int = 1000): List<TaskPost> {
        val path = "/api/task-posts?nearby=true&lat=$latitude&lng=$longitude&radius_m=$radiusM&status_scope=public"
        return requestArray(path).map { parseTaskPost(it) }
    }

    fun uploadImage(data: ByteArray, fileName: String, mimeType: String, target: String): UploadResponse {
        val boundary = "Boundary-${UUID.randomUUID()}"
        val connection = openConnection("/api/uploads/image", "POST")
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        connection.doOutput = true

        connection.outputStream.use { output ->
            output.write("--$boundary\r\n".toByteArray())
            output.write("Content-Disposition: form-data; name=\"target\"\r\n\r\n".toByteArray())
            output.write(target.toByteArray())
            output.write("\r\n".toByteArray())
            output.write("--$boundary\r\n".toByteArray())
            output.write("Content-Disposition: form-data; name=\"file\"; filename=\"$fileName\"\r\n".toByteArray())
            output.write("Content-Type: $mimeType\r\n\r\n".toByteArray())
            output.write(data)
            output.write("\r\n--$boundary--\r\n".toByteArray())
        }

        return parseUpload(readEnvelope(connection).getJSONObject("data"))
    }

    fun registerPushToken(platform: String, fcmToken: String, deviceId: String?, appVersion: String?) {
        val payload = JSONObject()
            .put("platform", platform)
            .put("fcmToken", fcmToken)
            .put("deviceId", deviceId)
            .put("appVersion", appVersion)
        requestUnit("/api/devices/push-token", "POST", payload)
    }

    fun absoluteUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (value.startsWith("http://") || value.startsWith("https://")) return value
        return AppConfig.webUrl(context, value)
    }

    private fun requestObject(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        val envelope = requestEnvelope(path, method, body)
        return envelope.optJSONObject("data") ?: JSONObject()
    }

    private fun requestArray(path: String): List<JSONObject> {
        val data = requestEnvelope(path, "GET", null).optJSONArray("data") ?: JSONArray()
        return (0 until data.length()).mapNotNull { data.optJSONObject(it) }
    }

    private fun requestUnit(path: String, method: String, body: JSONObject? = null) {
        requestEnvelope(path, method, body)
    }

    private fun requestEnvelope(path: String, method: String, body: JSONObject?): JSONObject {
        val connection = openConnection(path, method)
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        return readEnvelope(connection)
    }

    private fun openConnection(path: String, method: String): HttpURLConnection {
        val connection = URL(AppConfig.webUrl(context, path)).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 12_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json")
        CookieManager.getInstance().getCookie(AppConfig.webBaseUrl(context))?.let { cookie ->
            connection.setRequestProperty("Cookie", cookie)
        }
        return connection
    }

    private fun readEnvelope(connection: HttpURLConnection): JSONObject {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.use { input ->
            val output = ByteArrayOutputStream()
            input.copyTo(output)
            output.toString(Charsets.UTF_8.name())
        }.orEmpty()

        if (code == 401) throw APIError("로그인이 필요합니다.")
        val envelope = try {
            JSONObject(text)
        } catch (_: Throwable) {
            throw APIError("서버 응답을 읽지 못했습니다.")
        }

        if (code !in 200..299 || !envelope.optBoolean("ok", false)) {
            throw APIError(envelope.optString("error").ifBlank { "요청에 실패했습니다." })
        }
        return envelope
    }

    private fun parseSession(json: JSONObject): SessionState {
        val profileJson = json.optJSONObject("profile")
        return SessionState(
            authenticated = json.optBoolean("authenticated", false),
            userId = json.optNullableString("userId"),
            profile = profileJson?.let {
                Profile(
                    id = it.optString("id"),
                    nickname = it.optNullableString("nickname"),
                    displayName = it.optNullableString("displayName"),
                    avatarUrl = it.optNullableString("avatarUrl"),
                    phoneVerified = if (it.has("phoneVerified")) it.optBoolean("phoneVerified") else null,
                    profileOnboardingCompleted = if (it.has("profileOnboardingCompleted")) it.optBoolean("profileOnboardingCompleted") else null,
                    completedCount = it.optNullableInt("completedCount")
                )
            }
        )
    }

    private fun parseTaskPost(json: JSONObject): TaskPost {
        val images = json.optJSONArray("images") ?: JSONArray()
        return TaskPost(
            id = json.optString("id"),
            creatorId = json.optNullableString("creatorId"),
            creatorProfileId = json.optNullableString("creatorProfileId"),
            postType = json.optNullableString("postType"),
            title = json.optString("title", "부탁"),
            category = json.optNullableString("category"),
            categoryDetail = json.optNullableString("categoryDetail"),
            description = json.optNullableString("description"),
            mode = json.optNullableString("mode"),
            price = json.optInt("price", 0),
            deadlineAt = json.optNullableString("deadlineAt"),
            deadlineText = json.optNullableString("deadlineText"),
            availableTimeText = json.optNullableString("availableTimeText"),
            status = json.optNullableString("status"),
            addressText = json.optNullableString("addressText"),
            latitude = json.optNullableDouble("latitude"),
            longitude = json.optNullableDouble("longitude"),
            distanceMeters = json.optNullableDouble("distanceMeters"),
            images = (0 until images.length()).mapNotNull { images.optJSONObject(it) }.map {
                TaskPostImage(
                    id = it.optString("id"),
                    imageUrl = it.optNullableString("imageUrl"),
                    storageKey = it.optNullableString("storageKey"),
                    sortOrder = it.optNullableInt("sortOrder")
                )
            },
            creatorNickname = json.optNullableString("creatorNickname"),
            creatorAvatarUrl = json.optNullableString("creatorAvatarUrl"),
            creatorBio = json.optNullableString("creatorBio"),
            creatorMainCategories = json.optStringArray("creatorMainCategories"),
            creatorSubCategories = json.optStringArray("creatorSubCategories"),
            creatorGender = json.optNullableString("creatorGender"),
            creatorPhoneVerified = json.optNullableBoolean("creatorPhoneVerified"),
            creatorIdentityVerified = json.optNullableBoolean("creatorIdentityVerified"),
            creatorRatingAvg = json.optNullableDouble("creatorRatingAvg"),
            creatorReviewCount = json.optNullableInt("creatorReviewCount"),
            creatorCompletedCount = json.optNullableInt("creatorCompletedCount")
        )
    }

    private fun parseConversation(json: JSONObject): Conversation {
        return Conversation(
            id = json.optString("id"),
            dealId = json.optNullableString("dealId"),
            postId = json.optNullableString("postId"),
            requesterId = json.optNullableString("requesterId"),
            helperId = json.optNullableString("helperId"),
            lastMessage = json.optNullableString("lastMessage"),
            lastMessageAt = json.optNullableString("lastMessageAt"),
            postTitle = json.optNullableString("postTitle"),
            postCategory = json.optNullableString("postCategory"),
            postPrice = json.optNullableInt("postPrice"),
            postStatus = json.optNullableString("postStatus"),
            postCreatorId = json.optNullableString("postCreatorId"),
            postType = json.optNullableString("postType"),
            dealStatus = json.optNullableString("dealStatus"),
            dealReportedAt = json.optNullableString("dealReportedAt"),
            dealReportedBy = json.optNullableString("dealReportedBy"),
            dealReportedUserId = json.optNullableString("dealReportedUserId"),
            dealReportReason = json.optNullableString("dealReportReason"),
            dealReportDescription = json.optNullableString("dealReportDescription"),
            dealChatBlockedAt = json.optNullableString("dealChatBlockedAt"),
            requesterProfileId = json.optNullableString("requesterProfileId"),
            helperProfileId = json.optNullableString("helperProfileId"),
            applicationId = json.optNullableString("applicationId"),
            applicationStatus = json.optNullableString("applicationStatus"),
            applicationApplicantId = json.optNullableString("applicationApplicantId"),
            requesterNickname = json.optNullableString("requesterNickname"),
            helperNickname = json.optNullableString("helperNickname"),
            requesterAvatarUrl = json.optNullableString("requesterAvatarUrl"),
            helperAvatarUrl = json.optNullableString("helperAvatarUrl"),
            requesterBio = json.optNullableString("requesterBio"),
            helperBio = json.optNullableString("helperBio"),
            requesterMainCategories = json.optStringArray("requesterMainCategories"),
            helperMainCategories = json.optStringArray("helperMainCategories"),
            requesterSubCategories = json.optStringArray("requesterSubCategories"),
            helperSubCategories = json.optStringArray("helperSubCategories"),
            otherUserId = json.optNullableString("otherUserId"),
            otherNickname = json.optNullableString("otherNickname"),
            otherAvatarUrl = json.optNullableString("otherAvatarUrl"),
            otherBio = json.optNullableString("otherBio"),
            otherMainCategories = json.optStringArray("otherMainCategories"),
            otherSubCategories = json.optStringArray("otherSubCategories"),
            otherGender = json.optNullableString("otherGender"),
            otherRatingAvg = json.optNullableDouble("otherRatingAvg"),
            otherReviewCount = json.optNullableInt("otherReviewCount"),
            otherCompletedCount = json.optNullableInt("otherCompletedCount"),
            otherPhoneVerified = json.optNullableBoolean("otherPhoneVerified"),
            otherIdentityVerified = json.optNullableBoolean("otherIdentityVerified"),
            otherCareerSummary = json.optNullableString("otherCareerSummary"),
            otherCareerDescription = json.optNullableString("otherCareerDescription"),
            otherPortfolioLinks = json.optProfileLinks("otherPortfolioLinks"),
            otherWorkSampleImages = json.optProfileSampleImages("otherWorkSampleImages"),
            otherResponseTime = json.optNullableString("otherResponseTime"),
            hasChatAfterStarted = json.optNullableBoolean("hasChatAfterStarted"),
            myReviewId = json.optNullableString("myReviewId"),
            unreadCount = json.optNullableInt("unreadCount")
        )
    }

    private fun parseMessage(json: JSONObject): Message {
        return Message(
            id = json.optString("id"),
            conversationId = json.optString("conversationId"),
            senderId = json.optString("senderId"),
            messageType = json.optString("messageType", "text"),
            body = json.optNullableString("body"),
            imageUrl = json.optNullableString("imageUrl"),
            clientMessageId = json.optNullableString("clientMessageId"),
            deliveredAt = json.optNullableString("deliveredAt"),
            readAt = json.optNullableString("readAt"),
            createdAt = json.optString("createdAt")
        )
    }

    private fun parseUpload(json: JSONObject): UploadResponse {
        return UploadResponse(
            imageUrl = json.optString("imageUrl"),
            storageKey = json.optNullableString("storageKey")
        )
    }
}

private fun JSONObject.optNullableString(name: String): String? {
    if (!has(name) || isNull(name)) return null
    return optString(name).takeIf { it.isNotBlank() }
}

private fun JSONObject.optNullableInt(name: String): Int? {
    if (!has(name) || isNull(name)) return null
    return optInt(name)
}

private fun JSONObject.optNullableDouble(name: String): Double? {
    if (!has(name) || isNull(name)) return null
    return optDouble(name)
}

private fun JSONObject.optNullableBoolean(name: String): Boolean? {
    if (!has(name) || isNull(name)) return null
    return optBoolean(name)
}

private fun JSONObject.optStringArray(name: String): List<String> {
    val array = optJSONArray(name) ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        array.optString(index).takeIf { it.isNotBlank() }
    }
}

private fun JSONObject.optProfileLinks(name: String): List<ProfileLink> {
    val array = optJSONArray(name) ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val url = item.optNullableString("url") ?: return@mapNotNull null
        ProfileLink(
            title = item.optNullableString("title"),
            url = url
        )
    }
}

private fun JSONObject.optProfileSampleImages(name: String): List<ProfileSampleImage> {
    val array = optJSONArray(name) ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val imageUrl = item.optNullableString("imageUrl") ?: return@mapNotNull null
        ProfileSampleImage(
            imageUrl = imageUrl,
            storageKey = item.optNullableString("storageKey"),
            sortOrder = item.optNullableInt("sortOrder")
        )
    }
}
