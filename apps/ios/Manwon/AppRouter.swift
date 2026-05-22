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
    @Published var chatUnreadCount = 0
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
        return matchesPath(path, "/login")
            || matchesPath(path, "/signup")
            || matchesPath(path, "/profile-onboarding")
            || matchesPath(path, "/posts")
            || matchesPath(path, "/my/profiles")
            || matchesPath(path, "/register/request")
            || matchesPath(path, "/register/offer")
    }

    func updateSession(_ session: SessionState) {
        let requiresOnboarding = session.authenticated && session.profile?.profileOnboardingCompleted != true
        if onboardingRequired != requiresOnboarding {
            onboardingRequired = requiresOnboarding
        }
        if requiresOnboarding {
            routeToProfileOnboarding()
        }
    }

    func completeProfileOnboarding() {
        if onboardingRequired {
            onboardingRequired = false
        }
    }

    func openNativeRoute(path: String) {
        let normalized = path.isEmpty ? "/" : path
        if shouldBlockForOnboarding(normalized) {
            routeToProfileOnboarding()
            return
        }

        if normalized == "/chat" {
            setSelectedTab(.chat)
            setChatRoute(conversationId: nil, detailActive: false, advanceRevision: true)
            return
        }

        if normalized.hasPrefix("/chat/") {
            setSelectedTab(.chat)
            setChatRoute(conversationId: String(normalized.dropFirst("/chat/".count)), detailActive: true, advanceRevision: true)
            return
        }

        if matchesPath(normalized, "/nearby") {
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

        if matchesPath(normalized, "/activity") {
            setWebPath(normalized, for: .nearby)
            setSelectedTab(.nearby)
            return
        }

        if matchesPath(normalized, "/register") {
            setWebPath(normalized, for: .register)
            setSelectedTab(.register)
            return
        }

        if matchesPath(normalized, "/my") {
            setWebPath(normalized, for: .my)
            setSelectedTab(.my)
            return
        }

        setWebPath(normalized, for: .home)
        setSelectedTab(.home)
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

        if matchesPath(normalized, "/activity") {
            setWebPath(normalized, for: .nearby)
            if tab != .nearby {
                setSelectedTab(.nearby)
            }
            return
        }

        if matchesPath(normalized, "/my") {
            setWebPath(normalized, for: .my)
            if tab != .my {
                setSelectedTab(.my)
            }
            return
        }

        setWebPath(normalized, for: tab)
    }

    func homeScrollDidChange(isAtTop: Bool) {
        if homeIsAtTop != isAtTop {
            homeIsAtTop = isAtTop
        }
    }

    func showMapUnavailableNotice() {
        if !mapUnavailableNoticeVisible {
            mapUnavailableNoticeVisible = true
        }
    }

    func openPush(userInfo: [AnyHashable: Any]) {
        let data = dictionaryValue(userInfo["data"])

        if let conversationId = stringValue(userInfo["conversationId"]) ?? stringValue(data?["conversationId"]) {
            setSelectedTab(.chat)
            setChatRoute(conversationId: conversationId, detailActive: true, advanceRevision: true)
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
        setChatRoute(conversationId: nil, detailActive: false, advanceRevision: false)
        setWebPath("/profile-onboarding", for: .home)
        setSelectedTab(.home)
    }

    private func setSelectedTab(_ tab: AppTab) {
        if selectedTab != tab {
            selectedTab = tab
        }
    }

    private func setChatRoute(conversationId: String?, detailActive: Bool, advanceRevision: Bool) {
        var changed = false
        if chatConversationId != conversationId {
            chatConversationId = conversationId
            changed = true
        }
        if chatDetailActive != detailActive {
            chatDetailActive = detailActive
            changed = true
        }
        if changed || advanceRevision {
            chatRouteRevision += 1
        }
    }

    private func setWebPath(_ path: String, for tab: AppTab) {
        switch tab {
        case .home:
            if homePath != path {
                homePath = path
            }
        case .register:
            if registerPath != path {
                registerPath = path
            }
        case .nearby:
            if activityPath != path {
                activityPath = path
            }
        case .my:
            if myPath != path {
                myPath = path
            }
        case .chat:
            return
        }

        setDisplayedWebPath(path, for: tab)
    }

    private func setDisplayedWebPath(_ path: String, for tab: AppTab) {
        guard displayedWebPaths[tab] != path else { return }
        var nextDisplayedWebPaths = displayedWebPaths
        nextDisplayedWebPaths[tab] = path
        displayedWebPaths = nextDisplayedWebPaths
    }

    private func matchesPath(_ path: String, _ root: String) -> Bool {
        path == root || path.hasPrefix("\(root)/") || path.hasPrefix("\(root)?")
    }
}
