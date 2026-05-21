import Foundation
import WebKit

enum APIClientError: LocalizedError {
    case unauthenticated
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unauthenticated:
            return "로그인이 필요합니다."
        case .invalidResponse:
            return "서버 응답을 읽지 못했습니다."
        case .server(let message):
            return message
        }
    }
}

private struct APIEnvelope<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: String?
}

struct PushTokenRegistration: Encodable {
    let platform: String
    let fcmToken: String
    let deviceId: String?
    let appVersion: String?
}

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchSession() async throws -> SessionState {
        try await request("/api/auth/session")
    }

    func fetchConversations() async throws -> [Conversation] {
        try await request("/api/conversations")
    }

    func fetchMessages(conversationId: String) async throws -> [Message] {
        try await request("/api/conversations/\(conversationId)/messages")
    }

    func markConversationRead(conversationId: String) async throws {
        try await requestNoData("/api/conversations/\(conversationId)/read", method: "PATCH")
    }

    func sendTextMessage(conversationId: String, body: String, clientMessageId: String) async throws -> Message {
        try await request(
            "/api/conversations/\(conversationId)/messages",
            method: "POST",
            body: [
                "messageType": "text",
                "body": body,
                "clientMessageId": clientMessageId,
            ]
        )
    }

    func sendImageMessage(conversationId: String, imageUrl: String, clientMessageId: String) async throws -> Message {
        try await request(
            "/api/conversations/\(conversationId)/messages",
            method: "POST",
            body: [
                "messageType": "image",
                "imageUrl": imageUrl,
                "clientMessageId": clientMessageId,
            ]
        )
    }

    func uploadImage(data: Data, fileName: String, mimeType: String, target: String) async throws -> UploadResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = try await authorizedRequest(path: "/api/uploads/image", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(
            boundary: boundary,
            fields: ["target": target],
            fileField: "file",
            fileName: fileName,
            mimeType: mimeType,
            data: data
        )
        return try await perform(request)
    }

    func updateDealStatus(dealId: String, status: DealStatus) async throws {
        try await requestNoData("/api/deals/\(dealId)/status", method: "PATCH", body: ["status": status.rawValue])
    }

    func updateApplicationStatus(applicationId: String, status: String) async throws {
        try await requestNoData("/api/applications/\(applicationId)/status", method: "PATCH", body: ["status": status])
    }

    func fetchNearbyPosts(latitude: Double, longitude: Double, radiusM: Int = 1000) async throws -> [TaskPost] {
        var components = URLComponents()
        components.path = "/api/task-posts"
        components.queryItems = [
            URLQueryItem(name: "nearby", value: "true"),
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "radius_m", value: String(radiusM)),
            URLQueryItem(name: "status_scope", value: "public"),
        ]
        return try await request(components.string ?? "/api/task-posts")
    }

    func registerPushToken(_ input: PushTokenRegistration) async throws {
        try await requestNoData("/api/devices/push-token", method: "POST", body: input)
    }

    func absoluteURLString(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        if URL(string: value)?.scheme != nil {
            return value
        }
        return AppConfig.webURL(path: value).absoluteString
    }

    func request<T: Decodable, Body: Encodable>(_ path: String, method: String = "GET", body: Body? = nil) async throws -> T {
        var request = try await authorizedRequest(path: path, method: method)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        return try await perform(request)
    }

    func request<T: Decodable>(_ path: String, method: String = "GET") async throws -> T {
        let request = try await authorizedRequest(path: path, method: method)
        return try await perform(request)
    }

    func requestNoData<Body: Encodable>(_ path: String, method: String, body: Body? = nil) async throws {
        let _: EmptyPayload = try await request(path, method: method, body: body)
    }

    func requestNoData(_ path: String, method: String) async throws {
        let request = try await authorizedRequest(path: path, method: method)
        let _: EmptyPayload = try await perform(request)
    }

    private func authorizedRequest(path: String, method: String) async throws -> URLRequest {
        var request = URLRequest(url: AppConfig.webURL(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookieHeader = await cookieHeader() {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }
        return request
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthenticated
        }

        let envelope = try decoder.decode(APIEnvelope<T>.self, from: data)
        guard (200..<300).contains(httpResponse.statusCode), envelope.ok else {
            throw APIClientError.server(envelope.error ?? "요청에 실패했습니다.")
        }
        guard let payload = envelope.data else {
            throw APIClientError.invalidResponse
        }
        return payload
    }

    @MainActor
    private func cookieHeader() async -> String? {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let host = AppConfig.webBaseURL.host ?? ""
                let matchingCookies = cookies.filter { cookie in
                    let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
                    return host == domain || host.hasSuffix(".\(domain)") || domain == "localhost"
                }
                let header = HTTPCookie.requestHeaderFields(with: matchingCookies)["Cookie"]
                continuation.resume(returning: header?.isEmpty == false ? header : nil)
            }
        }
    }

    private func multipartBody(
        boundary: String,
        fields: [String: String],
        fileField: String,
        fileName: String,
        mimeType: String,
        data: Data
    ) -> Data {
        var body = Data()
        for (name, value) in fields {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            body.appendString("\(value)\r\n")
        }
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(fileName)\"\r\n")
        body.appendString("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        body.appendString("\r\n--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func appendString(_ value: String) {
        append(value.data(using: .utf8) ?? Data())
    }
}
