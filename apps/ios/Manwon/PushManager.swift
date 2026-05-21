import Foundation
import UIKit
import UserNotifications

#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
import FirebaseCore
import FirebaseMessaging
#endif

final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    @MainActor weak var router: AppRouter?
    private var pendingFCMToken: String?
    private var isFirebaseConfigured = false

    func attach(router: AppRouter) {
        Task { @MainActor in
            self.router = router
        }
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self

        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if FirebaseApp.app() == nil, Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            isFirebaseConfigured = true
            Messaging.messaging().delegate = self
        }
        #endif
    }

    func requestAuthorizationAndRegister() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        guard isFirebaseConfigured else { return }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { [weak self] token, _ in
            guard let self, let token else { return }
            self.pendingFCMToken = token
            self.submitPendingToken()
        }
        #endif
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        print("Remote notification registration failed: \(error.localizedDescription)")
    }

    func submitPendingToken() {
        guard let token = pendingFCMToken else { return }
        Task {
            do {
                let deviceId = await MainActor.run {
                    UIDevice.current.identifierForVendor?.uuidString
                }
                try await APIClient.shared.registerPushToken(PushTokenRegistration(
                    platform: "ios",
                    fcmToken: token,
                    deviceId: deviceId,
                    appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
                ))
                pendingFCMToken = nil
            } catch {
                // Keep the token pending until the web session cookie is available.
            }
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        Task { @MainActor in
            router?.openPush(userInfo: userInfo)
        }
        completionHandler()
    }
}

#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
extension PushManager: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        pendingFCMToken = fcmToken
        submitPendingToken()
    }
}
#endif
