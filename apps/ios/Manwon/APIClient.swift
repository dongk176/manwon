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

private struct AppointmentPayload: Encodable {
    let mode: String
    let scheduledAt: String
    let locationText: String?
}

private struct ReadConversationPayload: Encodable {
    let lastMessageId: String?
}

private struct DealStatusPayload: Encodable {
    let status: String
    let reportReason: String?
    let reportDescription: String?
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

struct ConversationReadState: Decodable, Hashable {
    let conversationId: String
    let userId: String
    let lastReadMessageId: String?
    let lastReadAt: String?
}

struct ConversationTarget: Decodable, Hashable {
    let conversationId: String?
    let postId: String?
    let route: String?
}

enum ConversationRealtimeEvent {
    case messageChanged(Message)
    case readStateChanged(ConversationReadState)
    case changed
    case connected
    case disconnected
}

final class ConversationRealtimeSubscription {
    private let conversationId: String
    private let onEvent: @MainActor (ConversationRealtimeEvent) -> Void
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
        onEvent: @escaping @MainActor (ConversationRealtimeEvent) -> Void,
        onTyping: @escaping @MainActor (ConversationTypingState) -> Void = { _ in }
    ) {
        self.conversationId = conversationId
        self.session = session
        self.onEvent = onEvent
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
        await MainActor.run {
            onEvent(.connected)
        }
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
                        await self.notifyDisconnected()
                        return
                    @unknown default:
                        break
                    }
                } catch {
                    await self.notifyDisconnected()
                    return
                }
            }
        }
    }

    private func notifyDisconnected() async {
        await MainActor.run {
            onEvent(.disconnected)
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
                    // Keep the existing socket alive; adaptive sync still protects freshness.
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

        guard let payload = frame[4] as? [String: Any] else { return }
        if payload["event"] as? String == "typing" {
            let typingPayload = payload["payload"] as? [String: Any] ?? [:]
            let state = ConversationTypingState(
                userId: stringValue(typingPayload, "userId", "user_id"),
                isTyping: (typingPayload["isTyping"] as? Bool) ?? (typingPayload["is_typing"] as? Bool) ?? false
            )
            await MainActor.run {
                onTyping(state)
            }
            return
        }

        let record = realtimeRecord(from: payload)
        let nestedPayload = payload["payload"] as? [String: Any]
        let table = stringValue(payload, "table")
            ?? nestedPayload.flatMap { stringValue($0, "table") }
            ?? record.flatMap { inferredTable(from: $0) }

        if table == "messages", let record, let message = message(from: record) {
            await MainActor.run {
                onEvent(.messageChanged(message))
            }
            return
        }

        if table == "conversation_read_states", let record, let readState = readState(from: record) {
            await MainActor.run {
                onEvent(.readStateChanged(readState))
            }
            return
        }

        await MainActor.run {
            onEvent(.changed)
        }
    }

    private func realtimeRecord(from payload: [String: Any]) -> [String: Any]? {
        let nestedPayload = payload["payload"] as? [String: Any]
        let candidates: [Any?] = [
            nestedPayload?["record"],
            nestedPayload?["new"],
            nestedPayload?["new_record"],
            payload["record"],
            payload["new"],
            payload["new_record"],
        ]
        return candidates.compactMap { $0 as? [String: Any] }.first
    }

    private func inferredTable(from record: [String: Any]) -> String? {
        if stringValue(record, "messageType", "message_type") != nil {
            return "messages"
        }
        if record.keys.contains("last_read_message_id") || record.keys.contains("lastReadMessageId") {
            return "conversation_read_states"
        }
        return nil
    }

    private func message(from record: [String: Any]) -> Message? {
        guard
            let id = stringValue(record, "id"),
            let conversationId = stringValue(record, "conversationId", "conversation_id"),
            let senderId = stringValue(record, "senderId", "sender_id"),
            let messageTypeValue = stringValue(record, "messageType", "message_type"),
            let messageType = MessageType(rawValue: messageTypeValue),
            let createdAt = stringValue(record, "createdAt", "created_at")
        else {
            return nil
        }

        return Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            messageType: messageType,
            body: stringValue(record, "body"),
            imageUrl: stringValue(record, "imageUrl", "image_url"),
            clientMessageId: stringValue(record, "clientMessageId", "client_message_id"),
            deliveredAt: stringValue(record, "deliveredAt", "delivered_at"),
            readAt: stringValue(record, "readAt", "read_at"),
            createdAt: createdAt
        )
    }

    private func readState(from record: [String: Any]) -> ConversationReadState? {
        guard
            let conversationId = stringValue(record, "conversationId", "conversation_id"),
            let userId = stringValue(record, "userId", "user_id")
        else {
            return nil
        }

        return ConversationReadState(
            conversationId: conversationId,
            userId: userId,
            lastReadMessageId: stringValue(record, "lastReadMessageId", "last_read_message_id"),
            lastReadAt: stringValue(record, "lastReadAt", "last_read_at")
        )
    }

    private func stringValue(_ record: [String: Any], _ keys: String...) -> String? {
        for key in keys {
            guard let value = record[key], !(value is NSNull) else { continue }
            if let text = value as? String {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
            if let value = value as? CustomStringConvertible {
                let text = value.description.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { return text }
            }
        }
        return nil
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

    func markConversationRead(conversationId: String, lastMessageId: String? = nil) async throws {
        try await requestNoData(
            "/api/conversations/\(conversationId)/read",
            method: "PATCH",
            body: ReadConversationPayload(lastMessageId: lastMessageId)
        )
    }

    func resolveConversationTarget(
        conversationId: String? = nil,
        dealId: String? = nil,
        applicationId: String? = nil,
        postId: String? = nil
    ) async throws -> ConversationTarget {
        var components = URLComponents()
        components.path = "/api/conversations/resolve"
        components.queryItems = [
            conversationId.map { URLQueryItem(name: "conversationId", value: $0) },
            dealId.map { URLQueryItem(name: "dealId", value: $0) },
            applicationId.map { URLQueryItem(name: "applicationId", value: $0) },
            postId.map { URLQueryItem(name: "postId", value: $0) },
        ].compactMap { $0 }
        return try await request(components.string ?? "/api/conversations/resolve")
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

    func updateDealStatus(dealId: String, status: DealStatus, reportReason: String? = nil, reportDescription: String? = nil) async throws {
        try await requestNoData(
            "/api/deals/\(dealId)/status",
            method: "PATCH",
            body: DealStatusPayload(
                status: status.rawValue,
                reportReason: reportReason,
                reportDescription: reportDescription
            )
        )
    }

    func updateApplicationStatus(applicationId: String, status: String) async throws {
        try await requestNoData("/api/applications/\(applicationId)/status", method: "PATCH", body: ["status": status])
    }

    func createReview(dealId: String, rating: Int, content: String?) async throws {
        try await requestNoData("/api/reviews", method: "POST", body: ReviewPayload(dealId: dealId, rating: rating, content: content))
    }

    func updateConversationAppointment(conversationId: String, mode: String, scheduledAt: String, locationText: String?) async throws {
        try await requestNoData(
            "/api/conversations/\(conversationId)/appointment",
            method: "PATCH",
            body: AppointmentPayload(mode: mode, scheduledAt: scheduledAt, locationText: locationText)
        )
    }

    func fetchUserReviews(userId: String) async throws -> [UserReview] {
        try await request("/api/users/\(userId)/reviews")
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
            return normalizedRemoteImageURLString(value)
        }
        return AppConfig.webURL(path: value).absoluteString
    }

    func displayImageURLString(_ value: String?, storageKey: String? = nil) -> String? {
        if let storageKey = normalizedImageStorageKey(storageKey) {
            return storageImageProxyURLString(storageKey)
        }
        if let storageKey = inferredImageStorageKey(from: value) {
            return storageImageProxyURLString(storageKey)
        }
        return absoluteURLString(value)
    }

    private func storageImageProxyURLString(_ storageKey: String) -> String {
        var components = URLComponents()
        components.path = "/api/uploads/image"
        components.queryItems = [URLQueryItem(name: "key", value: storageKey)]
        return AppConfig.webURL(path: components.string ?? "/api/uploads/image").absoluteString
    }

    private func inferredImageStorageKey(from value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        if let directKey = normalizedImageStorageKey(value) {
            return directKey
        }
        guard let url = URL(string: value), url.scheme != nil else {
            return nil
        }
        return normalizedImageStorageKey(url.path)
    }

    private func normalizedRemoteImageURLString(_ value: String) -> String {
        guard var components = URLComponents(string: value),
              components.scheme?.lowercased() == "http",
              let host = components.host?.lowercased(),
              host == "k.kakaocdn.net" || host.hasSuffix(".kakaocdn.net")
        else {
            return value
        }

        components.scheme = "https"
        return components.string ?? value
    }

    private func normalizedImageStorageKey(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let keySource = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let range = keySource.range(of: "manwon/") else { return nil }
        let key = String(keySource[range.lowerBound...])
        guard key.hasPrefix("manwon/"), !key.contains("..") else { return nil }
        guard key.range(of: #"\.(jpe?g|png|webp)$"#, options: [.regularExpression, .caseInsensitive]) != nil else {
            return nil
        }
        return key
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
