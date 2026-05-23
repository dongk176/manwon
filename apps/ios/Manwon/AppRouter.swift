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
    @Published var authenticated = false
    @Published var homePath = "/"
    @Published var registerPath = "/register"
    @Published var activityPath = "/activity"
    @Published var myPath = "/my"
    @Published var chatConversationId: String?
    @Published var chatRouteRevision = 0
    @Published var chatDetailActive = false
    @Published var chatUnreadCount = 0
    @Published var nearbySheetCoversBottomNav = false
    @Published private var webSplashCoversBottomNav: [AppTab: Bool] = [:]
    @Published private var webOverlayCoversBottomNav: [AppTab: Bool] = [:]
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
        if webSplashCoversBottomNav[selectedTab] == true { return true }
        if webOverlayCoversBottomNav[selectedTab] == true { return true }

        guard let path = displayedWebPaths[selectedTab] else { return false }
        return matchesPath(path, "/login")
            || matchesPath(path, "/signup")
            || matchesPath(path, "/profile-onboarding")
            || matchesPath(path, "/posts")
            || matchesPath(path, "/my/profiles")
            || matchesPath(path, "/register/request")
            || matchesPath(path, "/register/offer")
    }

    var hidesHomeFloatingWriteButton: Bool {
        if selectedTab != .home { return true }
        if onboardingRequired { return true }
        if mapUnavailableNoticeVisible { return true }
        if webSplashCoversBottomNav[.home] == true { return true }
        if webOverlayCoversBottomNav[.home] == true { return true }

        guard let path = displayedWebPaths[.home] else { return false }
        return matchesPath(path, "/login")
            || matchesPath(path, "/signup")
            || matchesPath(path, "/profile-onboarding")
            || matchesPath(path, "/posts")
            || matchesPath(path, "/register")
            || matchesPath(path, "/my")
    }

    func updateSession(_ session: SessionState) {
        authenticated = session.authenticated
        if !session.authenticated {
            onboardingRequired = false
            if currentRouteRequiresAuthentication {
                routeToLogin(next: currentRoutePath)
            }
            return
        }

        let requiresOnboarding = session.profile?.profileOnboardingCompleted != true
        if onboardingRequired != requiresOnboarding {
            onboardingRequired = requiresOnboarding
        }
        if requiresOnboarding && currentRouteRequiresAuthentication {
            routeToProfileOnboarding()
        }
    }

    @discardableResult
    func finishSocialLogin(_ session: SessionState, nextPath: String?) -> String {
        let destination = normalizeNextPath(nextPath)
        updateSession(session)

        guard session.authenticated else {
            routeToLogin(next: destination)
            return loginPath(next: destination)
        }

        guard session.profile?.profileOnboardingCompleted == true else {
            routeToProfileOnboarding()
            return "/profile-onboarding"
        }

        openNativeRoute(path: destination)
        return destination
    }

    func routeToLogin(next: String? = nil) {
        if onboardingRequired {
            onboardingRequired = false
        }
        setChatRoute(conversationId: nil, detailActive: false, advanceRevision: false)
        setWebPath(loginPath(next: next), for: .home)
        setSelectedTab(.home)
    }

    func completeProfileOnboarding() {
        if onboardingRequired {
            onboardingRequired = false
        }
    }

    func openNativeRoute(path: String) {
        let normalized = path.isEmpty ? "/" : path
        if requiresAuthentication(normalized) && !authenticated {
            routeToLogin(next: normalized)
            return
        }
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
        if requiresAuthentication(normalized) && !authenticated {
            routeToLogin(next: normalized)
            return
        }
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
        let routeCameFromActiveTab = tab == selectedTab
        if requiresAuthentication(normalized) && !authenticated {
            routeToLogin(next: normalized)
            return
        }
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

        if matchesPath(normalized, "/register") {
            setWebPath(normalized, for: .register)
            if tab != .register {
                setSelectedTab(.register)
            }
            return
        }

        if normalized == "/" || matchesPath(normalized, "/login") || matchesPath(normalized, "/signup") {
            setWebPath(normalized, for: tab)
            if routeCameFromActiveTab && tab != .home {
                setWebPath(normalized, for: .home)
                setSelectedTab(.home)
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

    func webOverlayDidChange(isPresented: Bool, for tab: AppTab) {
        guard webOverlayCoversBottomNav[tab] != isPresented else { return }
        var nextState = webOverlayCoversBottomNav
        nextState[tab] = isPresented
        webOverlayCoversBottomNav = nextState
    }

    func webSplashDidChange(isPresented: Bool, for tab: AppTab) {
        guard webSplashCoversBottomNav[tab] != isPresented else { return }
        var nextState = webSplashCoversBottomNav
        nextState[tab] = isPresented
        webSplashCoversBottomNav = nextState
    }

    func showMapUnavailableNotice() {
        if !mapUnavailableNoticeVisible {
            mapUnavailableNoticeVisible = true
        }
    }

    func openPush(userInfo: [AnyHashable: Any]) {
        if let conversationId = PushPayload.conversationId(from: userInfo) {
            setSelectedTab(.chat)
            setChatRoute(conversationId: conversationId, detailActive: true, advanceRevision: true)
            return
        }

        if let path = PushPayload.path(from: userInfo) {
            openNativeRoute(path: path)
            return
        }

        if let postId = PushPayload.postId(from: userInfo) {
            openWebPath("/posts/\(postId)")
        }
    }

    func isViewingConversation(_ conversationId: String) -> Bool {
        selectedTab == .chat && chatDetailActive && chatConversationId == conversationId
    }

    private func shouldBlockForOnboarding(_ path: String) -> Bool {
        onboardingRequired && requiresAuthentication(path) && path != "/profile-onboarding"
    }

    private func routeToProfileOnboarding() {
        setChatRoute(conversationId: nil, detailActive: false, advanceRevision: false)
        setWebPath("/profile-onboarding", for: .home)
        setSelectedTab(.home)
    }

    private func loginPath(next: String?) -> String {
        guard let next, !next.isEmpty, next != "/" else { return "/login" }
        var components = URLComponents()
        components.path = "/login"
        components.queryItems = [URLQueryItem(name: "next", value: next)]
        return components.string ?? "/login"
    }

    private func normalizeNextPath(_ path: String?) -> String {
        guard let path, path.hasPrefix("/"), !path.hasPrefix("//") else { return "/" }
        return path
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

    private var currentRoutePath: String {
        switch selectedTab {
        case .chat:
            if let chatConversationId, chatDetailActive {
                return "/chat/\(chatConversationId)"
            }
            return "/chat"
        case .home:
            return displayedWebPaths[.home] ?? homePath
        case .register:
            return displayedWebPaths[.register] ?? registerPath
        case .nearby:
            return displayedWebPaths[.nearby] ?? activityPath
        case .my:
            return displayedWebPaths[.my] ?? myPath
        }
    }

    private var currentRouteRequiresAuthentication: Bool {
        requiresAuthentication(currentRoutePath)
    }

    private func requiresAuthentication(_ path: String) -> Bool {
        matchesPath(path, "/chat")
            || matchesPath(path, "/register")
            || matchesPath(path, "/activity")
            || matchesPath(path, "/my")
            || matchesPath(path, "/profile-onboarding")
    }
}
