import SwiftUI
import UIKit

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
            if let prompt = permissionPrompts.prompt {
                PermissionPromptOverlay(prompt: prompt)
                    .zIndex(300)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: router.selectedTab)
        .animation(.easeInOut(duration: 0.18), value: router.hidesBottomNav)
        .animation(.easeInOut(duration: 0.16), value: keyboardVisible)
        .animation(.easeInOut(duration: 0.18), value: router.mapUnavailableNoticeVisible)
        .animation(.easeInOut(duration: 0.18), value: permissionPrompts.prompt?.id)
        .animation(.interactiveSpring(response: 0.3, dampingFraction: 0.86), value: router.homeIsAtTop)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .onAppear {
            Task {
                guard initialSessionChecked else { return }
                let session = await refreshSessionGate()
                if session?.authenticated == true {
                    await openDueReviewReminderIfNeeded()
                }
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            PushManager.shared.registerForRemoteNotificationsIfAuthorized()
            permissionPrompts.checkUnreadMessagesOnForeground()
            Task {
                guard initialSessionChecked else { return }
                let session = await refreshSessionGate()
                if session?.authenticated == true {
                    await openDueReviewReminderIfNeeded()
                }
            }
        }
    }

    private func resolveInitialSessionGate() async {
        initialSessionChecked = true

        let session = await fetchSessionForInitialGate()

        if session?.authenticated == true {
            await openDueReviewReminderIfNeeded()
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
        router.openNativeRoute(path: "/chat/\(conversationId)")
    }

    private func tabLayer<Content: View>(_ tab: AppTab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(router.selectedTab == tab ? 1 : 0)
            .scaleEffect(router.selectedTab == tab ? 1 : 0.992)
            .allowsHitTesting(router.selectedTab == tab)
            .accessibilityHidden(router.selectedTab != tab)
            .zIndex(router.selectedTab == tab ? 1 : 0)
            .animation(ManwonMotion.fade, value: router.selectedTab)
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

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
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
        Task { @MainActor in
            PushManager.shared.router?.open(url: url)
        }
        return true
    }
}
