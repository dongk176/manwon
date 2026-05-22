import CoreLocation
import Foundation

enum PostStatus: String, Codable {
    case open
    case pending
    case inProgress = "in_progress"
    case completed
    case cancelled
    case hidden
}

enum RequestMode: String, Codable {
    case nearby
    case online
    case both
}

enum DealStatus: String, Codable {
    case pending
    case accepted
    case inProgress = "in_progress"
    case completeRequested = "complete_requested"
    case completed
    case cancelled
    case disputed
}

enum MessageType: String, Codable {
    case text
    case image
    case system
}

struct Profile: Codable, Identifiable {
    let id: String
    let nickname: String?
    let displayName: String?
    let avatarUrl: String?
    let phoneVerified: Bool?
    let completedCount: Int?
}

struct SessionState: Codable {
    let authenticated: Bool
    let userId: String?
    let profile: Profile?
}

struct TaskPostImage: Codable, Identifiable {
    let id: String
    let imageUrl: String?
    let storageKey: String?
    let sortOrder: Int?
}

struct TaskPost: Codable, Identifiable {
    let id: String
    let creatorId: String?
    let postType: String?
    let title: String
    let category: String?
    let categoryDetail: String?
    let description: String?
    let mode: RequestMode?
    let price: Int
    let deadlineAt: String?
    let deadlineText: String?
    let availableTimeText: String?
    let status: PostStatus?
    let addressText: String?
    let latitude: Double?
    let longitude: Double?
    let distanceMeters: Double?
    let images: [TaskPostImage]?
    let creatorNickname: String?

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var distanceText: String {
        guard let distanceMeters else { return mode == .online ? "온라인" : "거리 미정" }
        if distanceMeters >= 1000 {
            return String(format: "%.1fkm", distanceMeters / 1000)
        }
        return "\(Int(distanceMeters.rounded()))m"
    }

    var priceText: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return "\(formatter.string(from: NSNumber(value: price)) ?? "\(price)")원"
    }
}

struct Conversation: Codable, Identifiable, Hashable {
    let id: String
    let dealId: String?
    let postId: String?
    let requesterId: String?
    let helperId: String?
    let lastMessage: String?
    let lastMessageAt: String?
    let postTitle: String?
    let postCategory: String?
    let postPrice: Int?
    let postStatus: PostStatus?
    let dealStatus: DealStatus?
    let applicationId: String?
    let applicationStatus: String?
    let requesterNickname: String?
    let helperNickname: String?
    let otherUserId: String?
    let otherNickname: String?
    let otherAvatarUrl: String?
    let otherRatingAvg: Double?
    let otherReviewCount: Int?
    let otherCompletedCount: Int?
    let otherPhoneVerified: Bool?
    let otherIdentityVerified: Bool?
    let otherCareerSummary: String?
    let otherResponseTime: String?
    let unreadCount: Int?

    var isClosed: Bool {
        dealStatus == .completed || dealStatus == .cancelled || applicationStatus == "rejected" || applicationStatus == "cancelled"
    }
}

struct Message: Codable, Identifiable, Hashable {
    let id: String
    let conversationId: String
    let senderId: String
    let messageType: MessageType
    let body: String?
    let imageUrl: String?
    let clientMessageId: String?
    let deliveredAt: String?
    let readAt: String?
    let createdAt: String
}

struct UploadResponse: Codable {
    let imageUrl: String
    let storageKey: String?
}

struct EmptyPayload: Codable {}
