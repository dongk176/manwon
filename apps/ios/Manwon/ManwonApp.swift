import KakaoSDKCommon
import SwiftUI
import UIKit

private let unreadMessagesNoticeSuppressedKey = "manwon_unread_messages_notice_suppressed"

@main
struct ManwonApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter()
    @StateObject private var permissionPrompts = PermissionPromptManager()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(router)
                .environmentObject(permissionPrompts)
                .onAppear {
                    PushManager.shared.attach(router: router)
                    PushManager.shared.registerForRemoteNotificationsIfAuthorized()
                }
                .onOpenURL { url in
                    if KakaoLoginManager.shared.handleOpenURL(url) {
                        return
                    }
                    router.open(url: url)
                }
        }
    }
}

struct RootTabView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    @Environment(\.scenePhase) private var scenePhase
    @State private var keyboardVisible = false
    @State private var initialSessionChecked = false
    @State private var initialSessionCheckStarted = false
    @State private var initializedTabs: Set<AppTab> = [.home]
    @State private var unreadNotice: UnreadMessagesNotice?
    @State private var isRefreshingUnreadState = false
    @State private var initialUnreadNoticeChecked = false

    var body: some View {
        Group {
            if initialSessionChecked {
                tabContent
            } else {
                InitialSessionGateView()
            }
        }
        .onAppear {
            guard !initialSessionCheckStarted else { return }
            initialSessionCheckStarted = true
            Task {
                await resolveInitialSessionGate()
            }
        }
    }

    private var tabContent: some View {
        ZStack {
            tabLayer(.home) {
                WebTabView(tab: .home, title: "뭐든해줌", path: $router.homePath)
            }

            tabLayer(.chat) {
                ChatListView()
            }

            tabLayer(.register) {
                WebTabView(tab: .register, title: "등록", path: $router.registerPath)
            }

            tabLayer(.nearby) {
                WebTabView(tab: .nearby, title: "내 활동", path: $router.activityPath)
            }

            tabLayer(.my) {
                WebTabView(tab: .my, title: "마이", path: $router.myPath)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .bottom) {
            if !router.hidesBottomNav && !keyboardVisible {
                ZStack(alignment: .bottomTrailing) {
                    ManwonBottomNav(selectedTab: $router.selectedTab, chatUnreadCount: router.chatUnreadCount, onSelect: { tab in
                        switch tab {
                        case .home:
                            router.openWebPath("/")
                        case .chat:
                            router.openNativeRoute(path: "/chat")
                        case .register:
                            router.openWebPath("/register")
                        case .nearby:
                            router.openWebPath("/activity")
                        case .my:
                            router.openWebPath("/my")
                        }
                    }) {
                        router.showMapUnavailableNotice()
                    }

                    if router.selectedTab == .home && !router.hidesHomeFloatingWriteButton {
                        ManwonFloatingWriteButton(expanded: router.homeIsAtTop) {
                            router.openWebPath("/register")
                        }
                        .padding(.trailing, 20)
                        .padding(.bottom, 70)
                        .transition(.scale(scale: 0.88, anchor: .bottomTrailing).combined(with: .opacity))
                    }
                }
                .zIndex(100)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay {
            if router.mapUnavailableNoticeVisible {
                MapUnavailableNotice {
                    router.mapUnavailableNoticeVisible = false
                }
                .zIndex(200)
            }
        }
        .overlay {
            if let notice = unreadNotice, permissionPrompts.prompt == nil {
                UnreadMessagesNoticeOverlay(
                    unreadCount: notice.unreadCount,
                    onSuppress: {
                        UserDefaults.standard.set(true, forKey: unreadMessagesNoticeSuppressedKey)
                        unreadNotice = nil
                    },
                    onConfirm: {
                        unreadNotice = nil
                    }
                )
                .zIndex(250)
            }
        }
        .overlay {
            if let prompt = permissionPrompts.prompt {
                PermissionPromptOverlay(prompt: prompt)
                    .zIndex(300)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: router.selectedTab)
        .animation(.easeInOut(duration: 0.18), value: router.hidesBottomNav)
        .animation(.easeInOut(duration: 0.16), value: keyboardVisible)
        .animation(.easeInOut(duration: 0.18), value: router.mapUnavailableNoticeVisible)
        .animation(.easeInOut(duration: 0.18), value: unreadNotice?.id)
        .animation(.easeInOut(duration: 0.18), value: permissionPrompts.prompt?.id)
        .animation(.interactiveSpring(response: 0.3, dampingFraction: 0.86), value: router.homeIsAtTop)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .onAppear {
            initializedTabs.insert(router.selectedTab)
            Task {
                guard initialSessionChecked else { return }
                let session = await refreshSessionGate()
                if session?.authenticated == true {
                    await openDueReviewReminderIfNeeded()
                }
            }
        }
        .onChange(of: router.selectedTab) { selectedTab in
            initializedTabs.insert(selectedTab)
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            NotificationCenter.default.post(name: .manwonAppDidBecomeActive, object: nil)
            PushManager.shared.registerForRemoteNotificationsIfAuthorized()
            Task {
                guard initialSessionChecked else { return }
                let session = await refreshSessionGate()
                if session?.authenticated == true {
                    await refreshUnreadState(showStartupNotice: false)
                    await openDueReviewReminderIfNeeded()
                } else {
                    router.chatUnreadCount = 0
                    unreadNotice = nil
                }
            }
        }
        .onChange(of: permissionPrompts.prompt?.id) { promptId in
            if promptId != nil {
                unreadNotice = nil
            }
        }
    }

    private func resolveInitialSessionGate() async {
        initialSessionChecked = true

        let session = await fetchSessionForInitialGate()

        if session?.authenticated == true {
            await refreshUnreadState(showStartupNotice: true)
            await openDueReviewReminderIfNeeded()
        } else {
            router.chatUnreadCount = 0
        }
    }

    @discardableResult
    private func refreshSessionGate() async -> SessionState? {
        guard let session = try? await APIClient.shared.fetchSession() else { return nil }
        router.updateSession(session)
        return session
    }

    private func fetchSessionForInitialGate() async -> SessionState? {
        var latestSession = await refreshSessionGate()
        if latestSession?.authenticated == true {
            return latestSession
        }

        for _ in 0..<2 {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return latestSession }

            if let session = await refreshSessionGate() {
                latestSession = session
                if session.authenticated {
                    return session
                }
            }
        }

        return latestSession
    }

    private func openDueReviewReminderIfNeeded() async {
        guard !router.onboardingRequired else { return }
        guard !(router.selectedTab == .chat && router.chatDetailActive) else { return }
        guard let reminder = try? await APIClient.shared.fetchDueReviewReminder(), let conversationId = reminder.conversationId else {
            return
        }
        router.openChatReview(conversationId: conversationId, source: .reminder)
    }

    private func refreshUnreadState(showStartupNotice: Bool) async {
        if showStartupNotice && initialUnreadNoticeChecked { return }
        guard !isRefreshingUnreadState else { return }
        isRefreshingUnreadState = true
        defer { isRefreshingUnreadState = false }

        do {
            let conversations = try await APIClient.shared.fetchConversations()
            let unreadCount = totalUnreadCount(conversations)
            router.chatUnreadCount = unreadCount

            if showStartupNotice {
                initialUnreadNoticeChecked = true
            }

            guard unreadCount > 0 else {
                unreadNotice = nil
                return
            }

            let pushPromptShown = await permissionPrompts.requestPushIfNeeded(
                context: .unreadMessages,
                unreadCount: unreadCount
            )
            guard !pushPromptShown, permissionPrompts.prompt == nil else {
                unreadNotice = nil
                return
            }

            guard showStartupNotice else { return }
            guard !UserDefaults.standard.bool(forKey: unreadMessagesNoticeSuppressedKey) else { return }
            unreadNotice = UnreadMessagesNotice(unreadCount: unreadCount)
        } catch {
            if showStartupNotice {
                initialUnreadNoticeChecked = true
            }
        }
    }

    private func totalUnreadCount(_ conversations: [Conversation]) -> Int {
        var total = 0
        for conversation in conversations {
            total += max(conversation.unreadCount ?? 0, 0)
            if total > 99 { return 100 }
        }
        return total
    }

    private func tabLayer<Content: View>(_ tab: AppTab, @ViewBuilder content: () -> Content) -> some View {
        Group {
            if initializedTabs.contains(tab) {
                content()
                    .opacity(router.selectedTab == tab ? 1 : 0)
                    .scaleEffect(router.selectedTab == tab ? 1 : 0.992)
                    .allowsHitTesting(router.selectedTab == tab)
                    .accessibilityHidden(router.selectedTab != tab)
                    .zIndex(router.selectedTab == tab ? 1 : 0)
                    .animation(ManwonMotion.fade, value: router.selectedTab)
            }
        }
    }
}

private struct InitialSessionGateView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image("LaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 112, height: 112)
            Text("뭐든해줌")
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(ManwonColor.text)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ManwonColor.surface)
    }
}

private struct UnreadMessagesNotice: Identifiable {
    let id = UUID()
    let unreadCount: Int
}

private struct UnreadMessagesNoticeOverlay: View {
    let unreadCount: Int
    let onSuppress: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "message.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(ManwonColor.brand)
                    .frame(width: 38, height: 38)
                    .background(ManwonColor.brandSoft)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("읽지 않은 메시지가 있어요")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(ManwonColor.text)
                            .lineLimit(2)

                        Text("채팅에 읽지 않은 메시지 \(unreadBadgeText)개가 있습니다.")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(ManwonColor.muted)
                            .lineLimit(2)
                            .lineSpacing(2)
                    }

                    HStack(spacing: 8) {
                        Button(action: onSuppress) {
                            Text("다시 보지 않기")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(ManwonColor.muted)
                                .padding(.horizontal, 8)
                                .frame(height: 34)
                        }
                        .buttonStyle(PressableScaleButtonStyle(scale: 0.97, pressedOpacity: 0.86))

                        Button(action: onConfirm) {
                            Text("확인")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 14)
                                .frame(height: 34)
                                .background(ManwonColor.brand)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(PressableScaleButtonStyle(scale: 0.97, pressedOpacity: 0.88))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .frame(maxWidth: 390)
            .background(ManwonColor.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(ManwonColor.line.opacity(0.9), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 8)
            .padding(.horizontal, 14)
            .padding(.top, 10)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private var unreadBadgeText: String {
        unreadCount > 99 ? "99+" : "\(unreadCount)"
    }
}

@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let kakaoNativeAppKey = AppConfig.kakaoNativeAppKey {
            KakaoSDK.initSDK(appKey: kakaoNativeAppKey)
        }
        PushManager.shared.configure()
        PushManager.shared.handleLaunchOptions(launchOptions)
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushManager.shared.didFailToRegisterForRemoteNotifications(error: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if KakaoLoginManager.shared.handleOpenURL(url) {
            return true
        }

        Task { @MainActor in
            PushManager.shared.router?.open(url: url)
        }
        return true
    }
}
