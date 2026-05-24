import CoreLocation
import Foundation

enum PostStatus: Codable, Hashable {
    case open
    case pending
    case inProgress
    case completed
    case cancelled
    case hidden
    case closed
    case unknown(String)

    var rawValue: String {
        switch self {
        case .open: return "open"
        case .pending: return "pending"
        case .inProgress: return "in_progress"
        case .completed: return "completed"
        case .cancelled: return "cancelled"
        case .hidden: return "hidden"
        case .closed: return "closed"
        case .unknown(let value): return value
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "open": self = .open
        case "pending": self = .pending
        case "in_progress": self = .inProgress
        case "completed": self = .completed
        case "cancelled": self = .cancelled
        case "hidden": self = .hidden
        case "closed": self = .closed
        default: self = .unknown(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        self = PostStatus(rawValue: value) ?? .unknown(value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RequestMode: Codable, Hashable {
    case nearby
    case online
    case both
    case unknown(String)

    var rawValue: String {
        switch self {
        case .nearby: return "nearby"
        case .online: return "online"
        case .both: return "both"
        case .unknown(let value): return value
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "nearby": self = .nearby
        case "online": self = .online
        case "both": self = .both
        default: self = .unknown(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        self = RequestMode(rawValue: value) ?? .unknown(value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum DealStatus: Codable, Hashable {
    case pending
    case accepted
    case inProgress
    case completeRequested
    case completed
    case cancelled
    case disputed
    case unknown(String)

    var rawValue: String {
        switch self {
        case .pending: return "pending"
        case .accepted: return "accepted"
        case .inProgress: return "in_progress"
        case .completeRequested: return "complete_requested"
        case .completed: return "completed"
        case .cancelled: return "cancelled"
        case .disputed: return "disputed"
        case .unknown(let value): return value
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "pending": self = .pending
        case "accepted": self = .accepted
        case "in_progress": self = .inProgress
        case "complete_requested": self = .completeRequested
        case "completed": self = .completed
        case "cancelled": self = .cancelled
        case "disputed": self = .disputed
        default: self = .unknown(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        self = DealStatus(rawValue: value) ?? .unknown(value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum MessageType: Codable, Hashable {
    case text
    case image
    case system
    case unknown(String)

    var rawValue: String {
        switch self {
        case .text: return "text"
        case .image: return "image"
        case .system: return "system"
        case .unknown(let value): return value
        }
    }

    init?(rawValue: String) {
        switch rawValue {
        case "text": self = .text
        case "image": self = .image
        case "system": self = .system
        default: self = .unknown(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        self = MessageType(rawValue: value) ?? .unknown(value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct Profile: Codable, Identifiable {
    let id: String
    let nickname: String?
    let displayName: String?
    let avatarUrl: String?
    let phoneVerified: Bool?
    let profileOnboardingCompleted: Bool?
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
    let creatorProfileId: String?
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
    let creatorAvatarUrl: String?
    let creatorBio: String?
    let creatorMainCategories: [String]?
    let creatorSubCategories: [String]?
    let creatorGender: String?
    let creatorPhoneVerified: Bool?
    let creatorIdentityVerified: Bool?
    let creatorRatingAvg: Double?
    let creatorReviewCount: Int?
    let creatorCompletedCount: Int?

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

struct ProfileLink: Codable, Hashable {
    let title: String?
    let url: String?
}

struct ProfileSampleImage: Codable, Hashable {
    let imageUrl: String?
    let storageKey: String?
    let sortOrder: Int?
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
    let postCreatorId: String?
    let postType: String?
    let dealStatus: DealStatus?
    let dealReportedAt: String?
    let dealReportedBy: String?
    let dealReportedUserId: String?
    let dealReportReason: String?
    let dealReportDescription: String?
    let dealChatBlockedAt: String?
    let requesterProfileId: String?
    let helperProfileId: String?
    let applicationId: String?
    let applicationStatus: String?
    let applicationApplicantId: String?
    let requesterNickname: String?
    let helperNickname: String?
    let requesterAvatarUrl: String?
    let helperAvatarUrl: String?
    let requesterBio: String?
    let helperBio: String?
    let requesterMainCategories: [String]?
    let helperMainCategories: [String]?
    let requesterSubCategories: [String]?
    let helperSubCategories: [String]?
    let otherUserId: String?
    let otherNickname: String?
    let otherAvatarUrl: String?
    let otherBio: String?
    let otherMainCategories: [String]?
    let otherSubCategories: [String]?
    let otherGender: String?
    let otherRatingAvg: Double?
    let otherReviewCount: Int?
    let otherCompletedCount: Int?
    let otherPhoneVerified: Bool?
    let otherIdentityVerified: Bool?
    let otherCareerSummary: String?
    let otherCareerDescription: String?
    let otherPortfolioLinks: [ProfileLink]?
    let otherWorkSampleImages: [ProfileSampleImage]?
    let otherResponseTime: String?
    let hasChatAfterStarted: Bool?
    let myReviewId: String?
    let unreadCount: Int?

    var isClosed: Bool {
        dealStatus == .completed || dealStatus == .cancelled || applicationStatus == "rejected" || applicationStatus == "cancelled"
    }
}

struct UserReview: Codable, Identifiable, Hashable {
    let id: String
    let dealId: String?
    let reviewerId: String?
    let revieweeId: String?
    let reviewerNickname: String?
    let reviewerAvatarUrl: String?
    let reviewerDefaultAvatarKey: String?
    let rating: Double?
    let content: String?
    let createdAt: String?
    let postTitle: String?
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
