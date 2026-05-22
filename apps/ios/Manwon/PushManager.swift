import Foundation
import CoreLocation
import SwiftUI
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
    private var pendingPushUserInfo: [AnyHashable: Any]?
    private var isFirebaseConfigured = false

    func attach(router: AppRouter) {
        Task { @MainActor in
            self.router = router
            if let userInfo = self.pendingPushUserInfo {
                self.pendingPushUserInfo = nil
                router.openPush(userInfo: userInfo)
            }
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

    func registerForRemoteNotificationsIfAuthorized() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus.allowsRemoteNotificationRegistration else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func requestAuthorizationAndRegister(completion: ((Bool) -> Void)? = nil) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            completion?(granted)
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
        let userInfo = notification.request.content.userInfo
        Task { @MainActor in
            if let conversationId = Self.stringValue(userInfo["conversationId"]) ?? Self.stringValue(Self.dictionaryValue(userInfo["data"])?["conversationId"]),
               router?.isViewingConversation(conversationId) == true {
                NotificationCenter.default.post(
                    name: .manwonConversationPushReceived,
                    object: nil,
                    userInfo: ["conversationId": conversationId]
                )
                completionHandler([])
                return
            }

            completionHandler([.banner, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        Task { @MainActor in
            if let router {
                router.openPush(userInfo: userInfo)
            } else {
                pendingPushUserInfo = userInfo
            }
        }
        completionHandler()
    }

    private static func dictionaryValue(_ value: Any?) -> [AnyHashable: Any]? {
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

    private static func stringValue(_ value: Any?) -> String? {
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

extension Notification.Name {
    static let manwonConversationPushReceived = Notification.Name("manwonConversationPushReceived")
}

enum PushPromptContext: String {
    case postCreated = "post_created"
    case conversationStarted = "conversation_started"
    case chatEntered = "chat_entered"
    case unreadMessages = "unread_messages"
    case dealAction = "deal_action"

    static func from(_ value: String?) -> PushPromptContext {
        guard let value, let context = PushPromptContext(rawValue: value) else {
            return .conversationStarted
        }
        return context
    }

    func copy(unreadCount: Int?) -> (title: String, message: String) {
        switch self {
        case .postCreated:
            return (
                "지원이나 문의가 오면 바로 알려드릴게요",
                "게시물을 올린 뒤에는 채팅, 지원, 거래 상태가 빠르게 바뀔 수 있어요. 알림을 켜두면 앱을 열지 않아도 바로 확인할 수 있습니다."
            )
        case .conversationStarted:
            return (
                "답장과 수락을 놓치지 않게 알려드릴게요",
                "상대가 답장하거나 거래를 수락하면 바로 확인할 수 있도록 알림을 보내드릴게요."
            )
        case .chatEntered:
            return (
                "새 메시지를 놓치지 않도록 알림을 켜둘게요",
                "채팅이 시작되면 답장 타이밍이 중요해요. 메시지가 오면 바로 알려드리겠습니다."
            )
        case .unreadMessages:
            let countText = unreadCount.map { "\($0)개" } ?? "새"
            return (
                "읽지 않은 메시지가 있어요",
                "읽지 않은 메시지가 \(countText) 있습니다. 메시지를 놓치지 않도록 알림을 켜주세요."
            )
        case .dealAction:
            return (
                "거래 진행 상황을 바로 알려드릴게요",
                "수락, 시작, 완료 요청처럼 중요한 거래 상태가 바뀌면 바로 확인할 수 있습니다."
            )
        }
    }
}

enum NativeLocationPromptContext {
    case nearby

    var copy: (title: String, message: String, primaryTitle: String, secondaryTitle: String) {
        switch self {
        case .nearby:
            return (
                "내 주변 부탁을 정확히 찾아볼까요?",
                "위치를 허용하면 현재 위치 기준으로 가까운 부탁을 보여드릴게요. 정확한 주소는 공개되지 않습니다.",
                "위치 허용하기",
                "나중에"
            )
        }
    }
}

@MainActor
final class PermissionPromptManager: ObservableObject {
    struct Prompt: Identifiable {
        let id = UUID()
        let iconName: String
        let title: String
        let message: String
        let primaryTitle: String
        let secondaryTitle: String
        let primaryAction: () -> Void
        let secondaryAction: () -> Void
    }

    @Published var prompt: Prompt?
    private var shownPromptKeys = Set<String>()
    private var isCheckingUnreadMessages = false

    func handleWebPermissionPrompt(permission: String, context: String?, unreadCount: Int?) {
        guard permission == "push" else { return }
        requestPush(context: PushPromptContext.from(context), unreadCount: unreadCount)
    }

    func requestPush(context: PushPromptContext, unreadCount: Int? = nil) {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            Task { @MainActor in
                self?.handleNotificationSettings(settings, context: context, unreadCount: unreadCount)
            }
        }
    }

    func checkUnreadMessagesOnForeground() {
        guard !isCheckingUnreadMessages else { return }
        isCheckingUnreadMessages = true
        Task {
            defer { isCheckingUnreadMessages = false }
            do {
                let conversations = try await APIClient.shared.fetchConversations()
                let unreadCount = conversations.reduce(0) { total, conversation in
                    total + max(conversation.unreadCount ?? 0, 0)
                }
                guard unreadCount > 0 else { return }
                requestPush(context: .unreadMessages, unreadCount: unreadCount)
            } catch {
                // Anonymous users and expired sessions do not need a permission prompt.
            }
        }
    }

    func requestLocation(
        context: NativeLocationPromptContext,
        authorizationStatus: CLAuthorizationStatus,
        onAllow: @escaping () -> Void
    ) {
        switch authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            onAllow()
        case .notDetermined:
            presentLocationPrompt(context: context, onAllow: onAllow)
        case .denied, .restricted:
            presentLocationSettingsPrompt(context: context)
        @unknown default:
            onAllow()
        }
    }

    private func handleNotificationSettings(
        _ settings: UNNotificationSettings,
        context: PushPromptContext,
        unreadCount: Int?
    ) {
        if settings.authorizationStatus.allowsRemoteNotificationRegistration {
            PushManager.shared.registerForRemoteNotificationsIfAuthorized()
            return
        }

        switch settings.authorizationStatus {
        case .notDetermined:
            presentPushPrompt(context: context, unreadCount: unreadCount)
        case .denied:
            presentPushSettingsPrompt(context: context, unreadCount: unreadCount)
        default:
            break
        }
    }

    private func presentPushPrompt(context: PushPromptContext, unreadCount: Int?) {
        let key = "push-\(context.rawValue)"
        guard markPromptShown(key) else { return }
        let copy = context.copy(unreadCount: unreadCount)
        prompt = Prompt(
            iconName: "bell.badge.fill",
            title: copy.title,
            message: copy.message,
            primaryTitle: "알림 켜기",
            secondaryTitle: "나중에",
            primaryAction: { [weak self] in
                self?.prompt = nil
                PushManager.shared.requestAuthorizationAndRegister()
            },
            secondaryAction: { [weak self] in
                self?.prompt = nil
            }
        )
    }

    private func presentPushSettingsPrompt(context: PushPromptContext, unreadCount: Int?) {
        let key = "push-settings-\(context.rawValue)"
        guard markPromptShown(key) else { return }
        let copy = context.copy(unreadCount: unreadCount)
        prompt = Prompt(
            iconName: "bell.slash.fill",
            title: "알림이 꺼져 있어요",
            message: "\(copy.message) 설정에서 알림을 허용하면 다시 받을 수 있습니다.",
            primaryTitle: "설정 열기",
            secondaryTitle: "나중에",
            primaryAction: { [weak self] in
                self?.prompt = nil
                Self.openAppSettings()
            },
            secondaryAction: { [weak self] in
                self?.prompt = nil
            }
        )
    }

    private func presentLocationPrompt(context: NativeLocationPromptContext, onAllow: @escaping () -> Void) {
        let copy = context.copy
        prompt = Prompt(
            iconName: "location.fill",
            title: copy.title,
            message: copy.message,
            primaryTitle: copy.primaryTitle,
            secondaryTitle: copy.secondaryTitle,
            primaryAction: { [weak self] in
                self?.prompt = nil
                onAllow()
            },
            secondaryAction: { [weak self] in
                self?.prompt = nil
            }
        )
    }

    private func presentLocationSettingsPrompt(context: NativeLocationPromptContext) {
        let copy = context.copy
        prompt = Prompt(
            iconName: "location.slash.fill",
            title: "위치 권한이 꺼져 있어요",
            message: "\(copy.message) 설정에서 위치 권한을 허용하거나 동네를 직접 선택해주세요.",
            primaryTitle: "설정 열기",
            secondaryTitle: "나중에",
            primaryAction: { [weak self] in
                self?.prompt = nil
                Self.openAppSettings()
            },
            secondaryAction: { [weak self] in
                self?.prompt = nil
            }
        )
    }

    private func markPromptShown(_ key: String) -> Bool {
        guard !shownPromptKeys.contains(key) else { return false }
        shownPromptKeys.insert(key)
        return true
    }

    private static func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

private extension UNAuthorizationStatus {
    var allowsRemoteNotificationRegistration: Bool {
        switch self {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
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
