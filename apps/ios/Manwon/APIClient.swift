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

private struct ReviewPayload: Encodable {
    let dealId: String
    let rating: Int
    let content: String?
}

private struct ReviewReminderPayload: Encodable {
    let dealId: String
}

private struct KakaoNativeLoginPayload: Encodable {
    let accessToken: String
}

private struct AppleNativeLoginPayload: Encodable {
    let identityToken: String
    let fullName: String?
}

private struct ReportPayload: Encodable {
    let targetUserId: String?
    let postId: String?
    let conversationId: String?
    let messageId: String?
    let reason: String
    let description: String?
}

private struct BlockPayload: Encodable {
    let blockedUserId: String
    let postId: String?
    let conversationId: String?
    let messageId: String?
    let reason: String?
    let description: String?
}

struct RealtimeToken: Decodable {
    let token: String
    let expiresIn: Int
    let websocketUrl: String?
}

struct ConversationTypingState: Sendable {
    let userId: String?
    let isTyping: Bool
}

struct DueReviewReminder: Decodable {
    let dealId: String
    let conversationId: String?
    let dueAt: String?
}

final class ConversationRealtimeSubscription {
    private let conversationId: String
    private let onChange: @MainActor () -> Void
    private let onTyping: @MainActor (ConversationTypingState) -> Void
    private let session: URLSession
    private var socket: URLSessionWebSocketTask?
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var tokenRefreshTask: Task<Void, Never>?
    private var ref = 1

    init(
        conversationId: String,
        session: URLSession = .shared,
        onChange: @escaping @MainActor () -> Void,
        onTyping: @escaping @MainActor (ConversationTypingState) -> Void = { _ in }
    ) {
        self.conversationId = conversationId
        self.session = session
        self.onChange = onChange
        self.onTyping = onTyping
    }

    deinit {
        disconnect()
    }

    func connect() async throws {
        disconnect()

        let token = try await APIClient.shared.fetchRealtimeToken()
        guard let websocketUrl = token.websocketUrl, let url = URL(string: websocketUrl) else {
            throw APIClientError.invalidResponse
        }

        let socket = session.webSocketTask(with: url)
        self.socket = socket
        socket.resume()

        try await join(accessToken: token.token)
        startReceiveLoop()
        startHeartbeat()
        startTokenRefresh(expiresIn: token.expiresIn)
    }

    func disconnect() {
        heartbeatTask?.cancel()
        receiveTask?.cancel()
        tokenRefreshTask?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        heartbeatTask = nil
        receiveTask = nil
        tokenRefreshTask = nil
        socket = nil
    }

    func sendTyping(userId: String, isTyping: Bool) async throws {
        try await send(
            topic: topic,
            event: "broadcast",
            payload: [
                "type": "broadcast",
                "event": "typing",
                "payload": [
                    "userId": userId,
                    "isTyping": isTyping,
                    "sentAt": ISO8601DateFormatter().string(from: Date()),
                ],
            ]
        )
    }

    private var topic: String {
        "realtime:conversation:\(conversationId)"
    }

    private func join(accessToken: String) async throws {
        try await send(
            topic: topic,
            event: "phx_join",
            payload: [
                "config": [
                    "broadcast": [
                        "ack": false,
                        "self": false,
                    ],
                    "presence": [
                        "enabled": false,
                    ],
                    "postgres_changes": [],
                    "private": true,
                ],
                "access_token": accessToken,
            ]
        )
    }

    private func startReceiveLoop() {
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let message = try await self.socket?.receive()
                    switch message {
                    case .string(let text):
                        await self.handleFrame(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            await self.handleFrame(text)
                        }
                    case nil:
                        return
                    @unknown default:
                        break
                    }
                } catch {
                    return
                }
            }
        }
    }

    private func startHeartbeat() {
        heartbeatTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                try? await self.send(topic: "phoenix", event: "heartbeat", payload: [:], joinRef: NSNull())
            }
        }
    }

    private func startTokenRefresh(expiresIn: Int) {
        tokenRefreshTask = Task { [weak self] in
            guard let self else { return }
            let refreshDelay = UInt64(max(expiresIn - 60, 60)) * 1_000_000_000
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: refreshDelay)
                do {
                    let token = try await APIClient.shared.fetchRealtimeToken()
                    try await self.send(
                        topic: self.topic,
                        event: "access_token",
                        payload: ["access_token": token.token]
                    )
                } catch {
                    // Keep the existing socket alive; the fallback poll still protects freshness.
                }
            }
        }
    }

    private func handleFrame(_ text: String) async {
        guard
            let data = text.data(using: .utf8),
            let frame = try? JSONSerialization.jsonObject(with: data) as? [Any],
            frame.count >= 5,
            let event = frame[3] as? String,
            event == "broadcast"
        else {
            return
        }

        let payload = frame[4] as? [String: Any]
        if payload?["event"] as? String == "typing" {
            let typingPayload = payload?["payload"] as? [String: Any] ?? [:]
            let state = ConversationTypingState(
                userId: typingPayload["userId"] as? String,
                isTyping: (typingPayload["isTyping"] as? Bool) ?? false
            )
            await MainActor.run {
                onTyping(state)
            }
            return
        }

        await MainActor.run {
            onChange()
        }
    }

    private func send(topic: String, event: String, payload: [String: Any], joinRef: Any = NSNull()) async throws {
        guard let socket else { throw APIClientError.invalidResponse }
        let frame: [Any] = [joinRef, nextRef(), topic, event, payload]
        let data = try JSONSerialization.data(withJSONObject: frame)
        guard let text = String(data: data, encoding: .utf8) else {
            throw APIClientError.invalidResponse
        }
        try await socket.send(.string(text))
    }

    private func nextRef() -> String {
        let value = String(ref)
        ref += 1
        return value
    }
}

final class APIClient {
    static let shared = APIClient()
    private static let sessionCookieName = "manwon_session"

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchSession() async throws -> SessionState {
        try await request("/api/auth/session")
    }

    func signInWithKakaoNative(accessToken: String) async throws -> SessionState {
        var request = URLRequest(url: AppConfig.webURL(path: "/api/auth/kakao/native"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(KakaoNativeLoginPayload(accessToken: accessToken))

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthenticated
        }

        let envelope = try decoder.decode(APIEnvelope<SessionState>.self, from: data)
        guard (200..<300).contains(httpResponse.statusCode), envelope.ok else {
            throw APIClientError.server(envelope.error ?? "카카오 로그인에 실패했습니다.")
        }
        guard envelope.data != nil else {
            throw APIClientError.invalidResponse
        }

        await storeResponseCookies(from: httpResponse)
        return try await fetchSession()
    }

    func signInWithAppleNative(identityToken: String, fullName: String?) async throws -> SessionState {
        var request = URLRequest(url: AppConfig.webURL(path: "/api/auth/apple/native"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(AppleNativeLoginPayload(identityToken: identityToken, fullName: fullName))

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthenticated
        }

        let envelope = try decoder.decode(APIEnvelope<SessionState>.self, from: data)
        guard (200..<300).contains(httpResponse.statusCode), envelope.ok else {
            throw APIClientError.server(envelope.error ?? "Apple 로그인에 실패했습니다.")
        }
        guard envelope.data != nil else {
            throw APIClientError.invalidResponse
        }

        await storeResponseCookies(from: httpResponse)
        return try await fetchSession()
    }

    func fetchConversations() async throws -> [Conversation] {
        try await request("/api/conversations")
    }

    func fetchMessages(conversationId: String) async throws -> [Message] {
        try await request("/api/conversations/\(conversationId)/messages")
    }

    func fetchMessages(conversationId: String, after: String?) async throws -> [Message] {
        guard let after, !after.isEmpty else {
            return try await fetchMessages(conversationId: conversationId)
        }
        var components = URLComponents()
        components.path = "/api/conversations/\(conversationId)/messages"
        components.queryItems = [URLQueryItem(name: "after", value: after)]
        return try await request(components.string ?? "/api/conversations/\(conversationId)/messages")
    }

    func fetchRealtimeToken() async throws -> RealtimeToken {
        try await request("/api/realtime/token")
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

    func createReview(dealId: String, rating: Int, content: String?) async throws {
        try await requestNoData("/api/reviews", method: "POST", body: ReviewPayload(dealId: dealId, rating: rating, content: content))
    }

    func scheduleReviewReminder(dealId: String) async throws {
        try await requestNoData("/api/review-reminders", method: "POST", body: ReviewReminderPayload(dealId: dealId))
    }

    func createReport(
        targetUserId: String?,
        postId: String?,
        conversationId: String?,
        messageId: String? = nil,
        reason: String,
        description: String?
    ) async throws {
        try await requestNoData(
            "/api/reports",
            method: "POST",
            body: ReportPayload(
                targetUserId: targetUserId,
                postId: postId,
                conversationId: conversationId,
                messageId: messageId,
                reason: reason,
                description: description
            )
        )
    }

    func createBlock(
        blockedUserId: String,
        postId: String?,
        conversationId: String?,
        messageId: String? = nil,
        reason: String? = nil,
        description: String? = nil
    ) async throws {
        try await requestNoData(
            "/api/blocks",
            method: "POST",
            body: BlockPayload(
                blockedUserId: blockedUserId,
                postId: postId,
                conversationId: conversationId,
                messageId: messageId,
                reason: reason,
                description: description
            )
        )
    }

    func fetchDueReviewReminder() async throws -> DueReviewReminder? {
        let request = try await authorizedRequest(path: "/api/review-reminders", method: "GET")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthenticated
        }

        let envelope = try decoder.decode(APIEnvelope<DueReviewReminder>.self, from: data)
        guard (200..<300).contains(httpResponse.statusCode), envelope.ok else {
            throw APIClientError.server(envelope.error ?? "요청에 실패했습니다.")
        }
        return envelope.data
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

    @MainActor
    func hasAuthSessionCookie() async -> Bool {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let hasSessionCookie = self.matchingWebCookies(from: cookies).contains { cookie in
                    cookie.name == Self.sessionCookieName && !cookie.value.isEmpty
                }
                continuation.resume(returning: hasSessionCookie)
            }
        }
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
    private func storeResponseCookies(from response: HTTPURLResponse) async {
        guard let url = response.url else { return }

        var headerFields: [String: String] = [:]
        response.allHeaderFields.forEach { key, value in
            guard let key = key as? String else { return }
            headerFields[key] = String(describing: value)
        }

        var cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
        if cookies.isEmpty {
            cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        }

        let webCookies = matchingWebCookies(from: cookies)
        guard !webCookies.isEmpty else { return }

        for cookie in webCookies {
            await withCheckedContinuation { continuation in
                WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) {
                    continuation.resume()
                }
            }
        }
    }

    @MainActor
    private func cookieHeader() async -> String? {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let matchingCookies = self.matchingWebCookies(from: cookies)
                let header = HTTPCookie.requestHeaderFields(with: matchingCookies)["Cookie"]
                continuation.resume(returning: header?.isEmpty == false ? header : nil)
            }
        }
    }

    private func matchingWebCookies(from cookies: [HTTPCookie]) -> [HTTPCookie] {
        let host = AppConfig.webBaseURL.host ?? ""
        return cookies.filter { cookie in
            let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
            return host == domain || host.hasSuffix(".\(domain)") || domain == "localhost"
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
