import SwiftUI

enum ManwonColor {
    static let brand = Color(red: 1.0, green: 0.282, blue: 0.0)
    static let brandSoft = Color(red: 1.0, green: 0.941, blue: 0.922)
    static let text = Color(red: 0.063, green: 0.063, blue: 0.063)
    static let muted = Color(red: 0.467, green: 0.467, blue: 0.486)
    static let line = Color(red: 0.914, green: 0.914, blue: 0.925)
    static let surface = Color.white
    static let background = Color(red: 0.965, green: 0.965, blue: 0.969)
}

enum ManwonMotion {
    static let press = Animation.interactiveSpring(response: 0.18, dampingFraction: 0.82)
    static let select = Animation.interactiveSpring(response: 0.26, dampingFraction: 0.84)
    static let fade = Animation.easeOut(duration: 0.18)
}

struct PressableScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    var pressedOpacity: Double = 0.82

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? pressedOpacity : 1)
            .animation(ManwonMotion.press, value: configuration.isPressed)
    }
}

private struct ManwonBottomNavItem: Identifiable {
    let id: AppTab
    let title: String
    let systemImage: String
}

private let manwonBottomNavItems = [
    ManwonBottomNavItem(id: .home, title: "홈", systemImage: "house.fill"),
    ManwonBottomNavItem(id: .chat, title: "채팅", systemImage: "message.fill"),
    ManwonBottomNavItem(id: .nearby, title: "내 활동", systemImage: "list.bullet.rectangle.fill"),
    ManwonBottomNavItem(id: .my, title: "마이", systemImage: "person.fill")
]

struct ManwonBottomNav: View {
    @Binding var selectedTab: AppTab
    var chatUnreadCount: Int = 0
    var onSelect: ((AppTab) -> Void)?
    var onUnavailableNearby: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(ManwonColor.line)
                .frame(height: 1)

            HStack(alignment: .top, spacing: 0) {
                ForEach(manwonBottomNavItems) { item in
                    Button {
                        withAnimation(ManwonMotion.select) {
                            if let onSelect {
                                onSelect(item.id)
                            } else {
                                selectedTab = item.id
                            }
                        }
                    } label: {
                        ManwonBottomNavButton(
                            item: item,
                            isSelected: selectedTab == item.id,
                            unreadCount: item.id == .chat ? chatUnreadCount : 0
                        )
                    }
                    .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.9))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .accessibilityLabel(item.title)
                    .accessibilityAddTraits(selectedTab == item.id ? .isSelected : [])
                }
            }
            .frame(height: 66)
            .padding(.horizontal, 10)
            .padding(.top, 7)
            .padding(.bottom, 0)
        }
        .frame(maxWidth: 430)
        .background(Color.white.opacity(0.96))
        .offset(y: 16)
    }
}

struct MapUnavailableNotice: View {
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.42)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(spacing: 18) {
                Text("지도 기능은 현재 준비중입니다.")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(ManwonColor.text)
                    .multilineTextAlignment(.center)

                Button(action: onClose) {
                    Text("확인")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(ManwonColor.brand)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(PressableScaleButtonStyle(scale: 0.98, pressedOpacity: 0.9))
            }
            .padding(20)
            .frame(maxWidth: 350)
            .padding(.horizontal, 20)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: Color.black.opacity(0.14), radius: 22, x: 0, y: 12)
        }
        .transition(.opacity)
    }
}

struct PermissionPromptOverlay: View {
    let prompt: PermissionPromptManager.Prompt

    var body: some View {
        ZStack {
            Color.black.opacity(0.42)
                .ignoresSafeArea()
                .onTapGesture(perform: prompt.secondaryAction)

            VStack(spacing: 18) {
                Image(systemName: prompt.iconName)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(ManwonColor.brand)
                    .frame(width: 58, height: 58)
                    .background(ManwonColor.brandSoft)
                    .clipShape(Circle())

                VStack(spacing: 8) {
                    Text(prompt.title)
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                        .multilineTextAlignment(.center)

                    Text(prompt.message)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(ManwonColor.muted)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }

                VStack(spacing: 9) {
                    Button(action: prompt.primaryAction) {
                        Text(prompt.primaryTitle)
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button(action: prompt.secondaryAction) {
                        Text(prompt.secondaryTitle)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(ManwonColor.muted)
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                    }
                    .buttonStyle(PressableScaleButtonStyle(scale: 0.98, pressedOpacity: 0.86))
                }
            }
            .padding(22)
            .frame(maxWidth: 350)
            .padding(.horizontal, 20)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: Color.black.opacity(0.14), radius: 22, x: 0, y: 12)
        }
        .transition(.opacity)
    }
}

private struct ManwonBottomNavButton: View {
    let item: ManwonBottomNavItem
    let isSelected: Bool
    let unreadCount: Int

    var body: some View {
        VStack(spacing: 4) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: item.systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .frame(width: 30, height: 30)
                    .foregroundStyle(isSelected ? ManwonColor.brand : ManwonColor.text)

                if unreadCount > 0 {
                    Text(unreadBadgeText(unreadCount))
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(isSelected ? ManwonColor.text : ManwonColor.brand)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(minWidth: 18, minHeight: 18)
                        .padding(.horizontal, unreadCount > 9 ? 5 : 0)
                        .offset(x: 16, y: -4)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 30, height: 30)

            Text(item.title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(isSelected ? ManwonColor.brand : ManwonColor.text)
        }
        .frame(maxWidth: .infinity)
        .animation(ManwonMotion.select, value: isSelected)
        .contentShape(Rectangle())
    }

    private func unreadBadgeText(_ count: Int) -> String {
        count > 99 ? "99+" : "\(count)"
    }
}

struct ManwonFloatingWriteButton: View {
    let expanded: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: expanded ? 5 : 0) {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .semibold))
                    .frame(width: 22, height: 22)

                if expanded {
                    Text("글쓰기")
                        .font(.system(size: 15, weight: .bold))
                        .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .trailing)))
                }
            }
            .foregroundStyle(Color.white)
            .frame(width: expanded ? 104 : 48, height: 48)
            .background(ManwonColor.brand)
            .clipShape(Capsule())
            .shadow(color: ManwonColor.brand.opacity(0.22), radius: 10, x: 0, y: 5)
        }
        .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.9))
        .accessibilityLabel("글쓰기")
    }
}

struct LoadingContent: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .tint(ManwonColor.brand)
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ManwonColor.surface)
    }
}

struct EmptyContent: View {
    let title: String
    var bodyText: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(ManwonColor.brand)
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            if let bodyText {
                Text(bodyText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(ManwonColor.muted)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 6)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ManwonColor.surface)
    }
}

struct ErrorContent: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        EmptyContent(
            title: "문제가 생겼어요",
            bodyText: message,
            actionTitle: "다시 시도",
            action: retry
        )
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var isSecondary = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(isSecondary ? ManwonColor.brand : Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(isSecondary ? ManwonColor.brandSoft : ManwonColor.brand)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(ManwonMotion.press, value: configuration.isPressed)
    }
}

struct Pill: View {
    let text: String
    var active = true

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(active ? ManwonColor.brand : ManwonColor.muted)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(active ? ManwonColor.brandSoft : Color(red: 0.95, green: 0.95, blue: 0.955))
            .clipShape(Capsule())
    }
}

func compactDateText(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "" }
    if let date = parseAPIDate(value) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "a h:mm" : "M.d"
        return formatter.string(from: date)
    }
    return ""
}

private func parseAPIDate(_ value: String) -> Date? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalized = trimmed.replacingOccurrences(of: " ", with: "T")

    let isoWithFraction = ISO8601DateFormatter()
    isoWithFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = isoWithFraction.date(from: normalized) {
        return date
    }

    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime]
    if let date = iso.date(from: normalized) {
        return date
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current

    for format in [
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss"
    ] {
        formatter.dateFormat = format
        if let date = formatter.date(from: normalized) {
            return date
        }
    }

    return nil
}

func statusText(_ conversation: Conversation) -> String {
    if conversation.dealStatus == .completed { return "거래완료" }
    if conversation.dealStatus == .cancelled { return "취소됨" }
    if conversation.dealStatus == .inProgress { return "진행중" }
    if conversation.dealStatus == .completeRequested { return "완료요청" }
    if conversation.dealStatus == .accepted { return "수락대기" }
    if conversation.applicationStatus == "rejected" || conversation.applicationStatus == "cancelled" { return "지원종료" }
    return conversation.applicationStatus == "applied" ? "지원됨" : "문의"
}
