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
    ManwonBottomNavItem(id: .nearby, title: "주변", systemImage: "map.fill"),
    ManwonBottomNavItem(id: .my, title: "마이", systemImage: "person.fill")
]

struct ManwonBottomNav: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(ManwonColor.line)
                .frame(height: 1)

            HStack(alignment: .top, spacing: 0) {
                ForEach(manwonBottomNavItems) { item in
                    Button {
                        withAnimation(ManwonMotion.select) {
                            selectedTab = item.id
                        }
                    } label: {
                        ManwonBottomNavButton(
                            item: item,
                            isSelected: selectedTab == item.id
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
            .padding(.bottom, 2)
        }
        .frame(maxWidth: 430)
        .background(
            Rectangle()
                .fill(.white.opacity(0.96))
                .background(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.05), radius: 18, x: 0, y: -8)
                .ignoresSafeArea(edges: .bottom)
        )
        .offset(y: 16)
    }
}

private struct ManwonBottomNavButton: View {
    let item: ManwonBottomNavItem
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: item.systemImage)
                .font(.system(size: 22, weight: .semibold))
                .frame(width: 30, height: 30)
                .foregroundStyle(isSelected ? ManwonColor.brand : ManwonColor.text)

            Text(item.title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(isSelected ? ManwonColor.brand : ManwonColor.text)
        }
        .frame(maxWidth: .infinity)
        .animation(ManwonMotion.select, value: isSelected)
        .contentShape(Rectangle())
    }
}

struct ManwonFloatingWriteButton: View {
    let expanded: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: expanded ? 6 : 0) {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .semibold))
                    .frame(width: 24, height: 24)

                if expanded {
                    Text("글쓰기")
                        .font(.system(size: 16, weight: .bold))
                        .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .trailing)))
                }
            }
            .foregroundStyle(Color.white)
            .frame(width: expanded ? 118 : 54, height: 54)
            .background(ManwonColor.brand)
            .clipShape(Capsule())
            .shadow(color: ManwonColor.brand.opacity(0.24), radius: 12, x: 0, y: 6)
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
    let iso = ISO8601DateFormatter()
    if let date = iso.date(from: value) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "a h:mm" : "M.d"
        return formatter.string(from: date)
    }
    return value
}

func statusText(_ conversation: Conversation) -> String {
    if conversation.dealStatus == .completed { return "거래완료" }
    if conversation.dealStatus == .cancelled { return "취소됨" }
    if conversation.dealStatus == .inProgress { return "진행중" }
    if conversation.dealStatus == .completeRequested { return "완료요청" }
    if conversation.dealStatus == .accepted { return "수락대기" }
    return conversation.applicationStatus == "applied" ? "지원됨" : "문의"
}
