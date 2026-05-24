import Foundation

enum AppTab: Hashable {
    case home
    case chat
    case register
    case nearby
    case my
}

enum ChatReportMode: String, Hashable {
    case conversation
    case completionDispute
}

enum ChatReviewSource: String, Hashable {
    case chatPrompt
    case reminder
}

enum ChatNavigationRoute: Hashable {
    case detail(conversationId: String)
    case report(conversationId: String, mode: ChatReportMode)
    case review(conversationId: String, source: ChatReviewSource)

    var conversationId: String {
        switch self {
        case .detail(let conversationId),
             .report(let conversationId, _),
             .review(let conversationId, _):
            return conversationId
        }
    }

    var stackRoutes: [ChatNavigationRoute] {
        switch self {
        case .detail:
            return [self]
        case .report(let conversationId, _):
            return [.detail(conversationId: conversationId), self]
        case .review(let conversationId, let source):
            if source == .reminder {
                return [self]
            }
            return [.detail(conversationId: conversationId), self]
        }
    }
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
    @Published var chatNavigationRoute: ChatNavigationRoute?
    @Published var chatRouteRevision = 0
    @Published var chatDetailActive = false
    @Published var chatUnreadCount = 0
    @Published var nearbySheetCoversBottomNav = false
    @Published private var webSplashCoversBottomNav: [AppTab: Bool] = [
        .home: true,
        .register: true,
        .nearby: true,
        .my: true
    ]
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
            || matchesPath(path, "/terms-consent")
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
            || matchesPath(path, "/terms-consent")
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

    func openHome() {
        setChatRoute(conversationId: nil, detailActive: false, advanceRevision: true)
        openWebPath("/")
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

    func openChatReview(conversationId: String, source: ChatReviewSource) {
        setSelectedTab(.chat)
        setChatRoute(.review(conversationId: conversationId, source: source), advanceRevision: true)
    }

    func chatStackDidChange(to route: ChatNavigationRoute?) {
        setChatRoute(route, advanceRevision: false)
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
            if routeCameFromActiveTab {
                routeToLogin(next: normalized)
            }
            return
        }
        if onboardingRequired && !matchesPath(normalized, "/terms-consent") {
            if routeCameFromActiveTab {
                routeToProfileOnboarding()
            }
            return
        }

        if matchesPath(normalized, "/activity") {
            if routeCameFromActiveTab || tab == .nearby {
                setWebPath(normalized, for: .nearby)
            }
            if routeCameFromActiveTab && tab != .nearby {
                setSelectedTab(.nearby)
            }
            return
        }

        if matchesPath(normalized, "/my") {
            if routeCameFromActiveTab || tab == .my {
                setWebPath(normalized, for: .my)
            }
            if routeCameFromActiveTab && tab != .my {
                setSelectedTab(.my)
            }
            return
        }

        if matchesPath(normalized, "/register") {
            if routeCameFromActiveTab || tab == .register {
                setWebPath(normalized, for: .register)
            }
            if routeCameFromActiveTab && tab != .register {
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
        let pushType = PushPayload.notificationType(from: userInfo)
        let dealId = PushPayload.dealId(from: userInfo)
        let applicationId = PushPayload.applicationId(from: userInfo)
        let postId = PushPayload.postId(from: userInfo)

        if pushType == "review.created" {
            openNativeRoute(path: "/my/reviews")
            return
        }

        if pushType == "review.reminder" {
            if let conversationId = PushPayload.conversationId(from: userInfo) {
                openChatReview(conversationId: conversationId, source: .reminder)
                return
            }
            if dealId != nil || applicationId != nil || postId != nil {
                Task { [weak self] in
                    await self?.resolveAndOpenPushTarget(
                        dealId: dealId,
                        applicationId: applicationId,
                        postId: postId,
                        fallbackPath: PushPayload.path(from: userInfo),
                        reviewSource: .reminder
                    )
                }
                return
            }
        }

        if let conversationId = PushPayload.conversationId(from: userInfo) {
            setSelectedTab(.chat)
            setChatRoute(conversationId: conversationId, detailActive: true, advanceRevision: true)
            return
        }

        let path = PushPayload.path(from: userInfo)
        if dealId != nil || applicationId != nil || postId != nil {
            Task { [weak self] in
                await self?.resolveAndOpenPushTarget(
                    dealId: dealId,
                    applicationId: applicationId,
                    postId: postId,
                    fallbackPath: path,
                    reviewSource: nil
                )
            }
            return
        }

        if let path = PushPayload.path(from: userInfo) {
            openNativeRoute(path: path)
            return
        }
    }

    func isViewingConversation(_ conversationId: String) -> Bool {
        selectedTab == .chat && chatDetailActive && chatConversationId == conversationId
    }

    private func shouldBlockForOnboarding(_ path: String) -> Bool {
        onboardingRequired && requiresAuthentication(path) && path != "/profile-onboarding" && !matchesPath(path, "/terms-consent")
    }

    private func resolveAndOpenPushTarget(
        dealId: String?,
        applicationId: String?,
        postId: String?,
        fallbackPath: String?,
        reviewSource: ChatReviewSource?
    ) async {
        do {
            let target = try await APIClient.shared.resolveConversationTarget(
                dealId: dealId,
                applicationId: applicationId,
                postId: postId
            )
            if let conversationId = target.conversationId {
                if let reviewSource {
                    openChatReview(conversationId: conversationId, source: reviewSource)
                } else {
                    setSelectedTab(.chat)
                    setChatRoute(conversationId: conversationId, detailActive: true, advanceRevision: true)
                }
                return
            }
            if let route = target.route {
                openNativeRoute(path: route)
                return
            }
        } catch {
            // Older or partial payloads still fall back to the best local route below.
        }

        if let fallbackPath {
            openNativeRoute(path: fallbackPath)
        } else if let postId {
            openWebPath("/posts/\(postId)")
        } else {
            openWebPath("/")
        }
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
        let route: ChatNavigationRoute?
        if detailActive, let conversationId {
            route = .detail(conversationId: conversationId)
        } else {
            route = nil
        }
        setChatRoute(route, advanceRevision: advanceRevision)
    }

    private func setChatRoute(_ route: ChatNavigationRoute?, advanceRevision: Bool) {
        var changed = false
        let conversationId = route?.conversationId
        let detailActive = route != nil
        if chatConversationId != conversationId {
            chatConversationId = conversationId
            changed = true
        }
        if chatNavigationRoute != route {
            chatNavigationRoute = route
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
            || matchesPath(path, "/terms-consent")
    }
}
