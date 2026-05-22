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
    @Published var activityPath = "/activity"
    @Published var myPath = "/my"
    @Published var chatConversationId: String?
    @Published var chatRouteRevision = 0
    @Published var chatDetailActive = false
    @Published var nearbySheetCoversBottomNav = false
    @Published var homeIsAtTop = true
    @Published var mapUnavailableNoticeVisible = false
    @Published var onboardingRequired = false
    @Published private var displayedWebPaths: [AppTab: String] = [
        .home: "/",
        .register: "/register",
        .nearby: "/activity",
        .my: "/my"
    ]

    var hidesBottomNav: Bool {
        if onboardingRequired { return true }
        if selectedTab == .chat && chatDetailActive { return true }
        if selectedTab == .nearby && nearbySheetCoversBottomNav { return true }

        guard let path = displayedWebPaths[selectedTab] else { return false }
        return path == "/login"
            || path.hasPrefix("/login?")
            || path == "/signup"
            || path.hasPrefix("/signup?")
            || path == "/profile-onboarding"
            || path.hasPrefix("/posts/")
            || path == "/register/request"
            || path == "/register/offer"
    }

    func updateSession(_ session: SessionState) {
        onboardingRequired = session.authenticated && session.profile?.profileOnboardingCompleted != true
        if onboardingRequired {
            routeToProfileOnboarding()
        }
    }

    func completeProfileOnboarding() {
        onboardingRequired = false
    }

    func openNativeRoute(path: String) {
        let normalized = path.isEmpty ? "/" : path
        if shouldBlockForOnboarding(normalized) {
            routeToProfileOnboarding()
            return
        }

        if normalized == "/chat" {
            selectedTab = .chat
            chatConversationId = nil
            chatDetailActive = false
            chatRouteRevision += 1
            return
        }

        if normalized.hasPrefix("/chat/") {
            selectedTab = .chat
            chatConversationId = String(normalized.dropFirst("/chat/".count))
            chatDetailActive = true
            chatRouteRevision += 1
            return
        }

        if normalized == "/nearby" || normalized.hasPrefix("/nearby/") {
            openWebPath("/activity")
            return
        }

        openWebPath(normalized)
    }

    func openWebPath(_ path: String) {
        let normalized = path.isEmpty ? "/" : path
        if shouldBlockForOnboarding(normalized) {
            routeToProfileOnboarding()
            return
        }

        if normalized == "/activity" || normalized.hasPrefix("/activity/") {
            activityPath = normalized
            webRouteDidChange(normalized, for: .nearby)
            selectedTab = .nearby
            return
        }

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
        if onboardingRequired {
            routeToProfileOnboarding()
            return
        }

        var nextDisplayedWebPaths = displayedWebPaths
        if normalized == "/activity" || normalized.hasPrefix("/activity/") {
            nextDisplayedWebPaths[.nearby] = normalized
            displayedWebPaths = nextDisplayedWebPaths
            if tab != .nearby {
                activityPath = normalized
                selectedTab = .nearby
            }
            return
        }

        if normalized == "/my" || normalized.hasPrefix("/my/") {
            nextDisplayedWebPaths[.my] = normalized
            displayedWebPaths = nextDisplayedWebPaths
            if tab != .my {
                myPath = normalized
                selectedTab = .my
            }
            return
        }

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
        let data = dictionaryValue(userInfo["data"])

        if let conversationId = stringValue(userInfo["conversationId"]) ?? stringValue(data?["conversationId"]) {
            selectedTab = .chat
            chatConversationId = conversationId
            chatDetailActive = true
            chatRouteRevision += 1
            return
        }

        if let postId = stringValue(userInfo["postId"]) ?? stringValue(data?["postId"]) {
            openWebPath("/posts/\(postId)")
        }
    }

    func isViewingConversation(_ conversationId: String) -> Bool {
        selectedTab == .chat && chatDetailActive && chatConversationId == conversationId
    }

    private func dictionaryValue(_ value: Any?) -> [AnyHashable: Any]? {
        if let value = value as? [AnyHashable: Any] {
            return value
        }
        if let value = value as? [String: Any] {
            return Dictionary(uniqueKeysWithValues: value.map { (AnyHashable($0.key), $0.value) })
        }
        if let value = value as? String,
           let data = value.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return Dictionary(uniqueKeysWithValues: object.map { (AnyHashable($0.key), $0.value) })
        }
        return nil
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

    private func shouldBlockForOnboarding(_ path: String) -> Bool {
        onboardingRequired && path != "/profile-onboarding"
    }

    private func routeToProfileOnboarding() {
        chatDetailActive = false
        chatConversationId = nil
        homePath = "/profile-onboarding"
        displayedWebPaths[.home] = "/profile-onboarding"
        selectedTab = .home
    }
}
