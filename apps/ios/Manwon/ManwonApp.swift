import SwiftUI
import UIKit

@main
struct ManwonApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(router)
                .onAppear {
                    PushManager.shared.attach(router: router)
                }
                .task {
                    PushManager.shared.requestAuthorizationAndRegister()
                }
        }
    }
}

struct RootTabView: View {
    @EnvironmentObject private var router: AppRouter
    @State private var keyboardVisible = false

    var body: some View {
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
                NearbyView()
            }

            tabLayer(.my) {
                WebTabView(tab: .my, title: "마이", path: $router.myPath)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .bottom) {
            if !router.hidesBottomNav && !keyboardVisible {
                ZStack(alignment: .bottomTrailing) {
                    ManwonBottomNav(selectedTab: $router.selectedTab)

                    if router.selectedTab == .home {
                        ManwonFloatingWriteButton(expanded: router.homeIsAtTop) {
                            router.openWebPath("/register")
                        }
                        .padding(.trailing, 20)
                        .padding(.bottom, 106)
                        .transition(.scale(scale: 0.88, anchor: .bottomTrailing).combined(with: .opacity))
                    }
                }
                .zIndex(100)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.18), value: router.selectedTab)
        .animation(.easeInOut(duration: 0.18), value: router.hidesBottomNav)
        .animation(.easeInOut(duration: 0.16), value: keyboardVisible)
        .animation(.interactiveSpring(response: 0.3, dampingFraction: 0.86), value: router.homeIsAtTop)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
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

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        PushManager.shared.configure()
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
