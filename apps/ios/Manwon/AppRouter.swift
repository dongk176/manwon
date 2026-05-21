import Foundation

enum AppTab: Hashable {
    case home
    case chat
    case register
    case nearby
    case my
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var selectedTab: AppTab = .home
    @Published var homePath = "/"
    @Published var registerPath = "/register"
    @Published var myPath = "/my"
    @Published var chatConversationId: String?
    @Published var chatDetailActive = false
    @Published var nearbySheetCoversBottomNav = false
    @Published var homeIsAtTop = true
    @Published var mapUnavailableNoticeVisible = false
    @Published private var displayedWebPaths: [AppTab: String] = [
        .home: "/",
        .register: "/register",
        .my: "/my"
    ]

    var hidesBottomNav: Bool {
        if selectedTab == .chat && chatDetailActive { return true }
        if selectedTab == .nearby && nearbySheetCoversBottomNav { return true }

        guard let path = displayedWebPaths[selectedTab] else { return false }
        return path == "/login"
            || path.hasPrefix("/login?")
            || path == "/signup"
            || path.hasPrefix("/signup?")
            || path.hasPrefix("/posts/")
            || path == "/register/request"
            || path == "/register/offer"
    }

    func openNativeRoute(path: String) {
        let normalized = path.isEmpty ? "/" : path

        if normalized == "/chat" {
            selectedTab = .chat
            chatConversationId = nil
            return
        }

        if normalized.hasPrefix("/chat/") {
            selectedTab = .chat
            chatConversationId = String(normalized.dropFirst("/chat/".count))
            return
        }

        if normalized == "/nearby" || normalized.hasPrefix("/nearby/") {
            showMapUnavailableNotice()
            return
        }

        openWebPath(normalized)
    }

    func openWebPath(_ path: String) {
        let normalized = path.isEmpty ? "/" : path
        if normalized == "/register" || normalized.hasPrefix("/register/") {
            registerPath = normalized
            webRouteDidChange(normalized, for: .register)
            selectedTab = .register
            return
        }

        if normalized == "/my" || normalized.hasPrefix("/my/") {
            myPath = normalized
            webRouteDidChange(normalized, for: .my)
            selectedTab = .my
            return
        }

        homePath = normalized
        webRouteDidChange(normalized, for: .home)
        selectedTab = .home
    }

    func open(url: URL) {
        let path = AppConfig.pathWithQuery(from: url)
        openNativeRoute(path: path)
    }

    func webRouteDidChange(_ path: String, for tab: AppTab) {
        let normalized = path.isEmpty ? "/" : path
        var nextDisplayedWebPaths = displayedWebPaths
        nextDisplayedWebPaths[tab] = normalized
        displayedWebPaths = nextDisplayedWebPaths
    }

    func homeScrollDidChange(isAtTop: Bool) {
        homeIsAtTop = isAtTop
    }

    func showMapUnavailableNotice() {
        mapUnavailableNoticeVisible = true
    }

    func openPush(userInfo: [AnyHashable: Any]) {
        if let conversationId = stringValue(userInfo["conversationId"]) {
            selectedTab = .chat
            chatConversationId = conversationId
            return
        }

        if let postId = stringValue(userInfo["postId"]) {
            openWebPath("/posts/\(postId)")
        }
    }

    private func stringValue(_ value: Any?) -> String? {
        if let value = value as? String, !value.isEmpty {
            return value
        }
        if let value = value as? CustomStringConvertible {
            let text = value.description
            return text.isEmpty ? nil : text
        }
        return nil
    }
}
