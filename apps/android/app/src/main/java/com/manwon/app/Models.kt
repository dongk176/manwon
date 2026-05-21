package com.manwon.app

import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class AppTab {
    HOME,
    CHAT,
    REGISTER,
    NEARBY,
    MY
}

data class Profile(
    val id: String,
    val nickname: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val phoneVerified: Boolean?,
    val completedCount: Int?
)

data class SessionState(
    val authenticated: Boolean,
    val userId: String?,
    val profile: Profile?
)

data class TaskPostImage(
    val id: String,
    val imageUrl: String?,
    val storageKey: String?,
    val sortOrder: Int?
)

data class TaskPost(
    val id: String,
    val creatorId: String?,
    val postType: String?,
    val title: String,
    val category: String?,
    val categoryDetail: String?,
    val description: String?,
    val mode: String?,
    val price: Int,
    val deadlineAt: String?,
    val deadlineText: String?,
    val availableTimeText: String?,
    val status: String?,
    val addressText: String?,
    val latitude: Double?,
    val longitude: Double?,
    val distanceMeters: Double?,
    val images: List<TaskPostImage>,
    val creatorNickname: String?
) {
    val distanceText: String
        get() {
            val distance = distanceMeters ?: return if (mode == "online") "온라인" else "거리 미정"
            return if (distance >= 1000) String.format(Locale.KOREA, "%.1fkm", distance / 1000.0) else "${distance.toInt()}m"
        }

    val priceText: String
        get() = NumberFormat.getNumberInstance(Locale.KOREA).format(price) + "원"
}

data class Conversation(
    val id: String,
    val dealId: String?,
    val postId: String?,
    val requesterId: String?,
    val helperId: String?,
    val lastMessage: String?,
    val lastMessageAt: String?,
    val postTitle: String?,
    val postCategory: String?,
    val postPrice: Int?,
    val postStatus: String?,
    val dealStatus: String?,
    val applicationId: String?,
    val applicationStatus: String?,
    val requesterNickname: String?,
    val helperNickname: String?,
    val otherUserId: String?,
    val otherNickname: String?,
    val unreadCount: Int?
) {
    val isClosed: Boolean
        get() = dealStatus == "completed" || dealStatus == "cancelled"
}

data class Message(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val messageType: String,
    val body: String?,
    val imageUrl: String?,
    val clientMessageId: String?,
    val deliveredAt: String?,
    val readAt: String?,
    val createdAt: String
)

data class UploadResponse(
    val imageUrl: String,
    val storageKey: String?
)

fun compactDateText(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return try {
        val instant = Instant.parse(value)
        val zone = ZoneId.systemDefault()
        val date = instant.atZone(zone)
        val now = java.time.ZonedDateTime.now(zone)
        val pattern = if (date.toLocalDate() == now.toLocalDate()) "a h:mm" else "M.d"
        DateTimeFormatter.ofPattern(pattern, Locale.KOREA).format(date)
    } catch (_: Throwable) {
        value
    }
}

fun statusText(conversation: Conversation): String {
    return when (conversation.dealStatus) {
        "completed" -> "거래완료"
        "cancelled" -> "취소됨"
        "in_progress" -> "진행중"
        "complete_requested" -> "완료요청"
        "accepted" -> "수락대기"
        else -> if (conversation.applicationStatus == "applied") "지원됨" else "문의"
    }
}
