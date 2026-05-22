import PhotosUI
import SwiftUI
import UIKit

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var unreadCount = 0
    @Published var isLoading = true
    @Published var errorMessage: String?

    func load(silent: Bool = false) async {
        if !silent { isLoading = true }
        do {
            let nextConversations = try await APIClient.shared.fetchConversations()
            conversations = nextConversations
            unreadCount = Self.totalUnreadCount(nextConversations)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private static func totalUnreadCount(_ conversations: [Conversation]) -> Int {
        var total = 0
        for conversation in conversations {
            total += max(conversation.unreadCount ?? 0, 0)
            if total > 99 { return 100 }
        }
        return total
    }

    func poll() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            await load(silent: true)
        }
    }
}

struct ChatListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    @StateObject private var viewModel = ChatListViewModel()
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                ChatPageHeader(title: "채팅")
                content
            }
            .background(ManwonColor.surface)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { conversationId in
                ChatDetailView(conversationId: conversationId)
            }
        }
        .task {
            await viewModel.load()
            if !viewModel.conversations.isEmpty {
                permissionPrompts.requestPush(context: .chatEntered)
            }
            await viewModel.poll()
        }
        .onChange(of: router.chatConversationId) { conversationId in
            guard let conversationId else { return }
            path = [conversationId]
        }
        .onChange(of: router.chatRouteRevision) { _ in
            syncRouterConversation()
        }
        .onChange(of: path) { value in
            router.chatDetailActive = !value.isEmpty
            if let conversationId = value.last {
                router.chatConversationId = conversationId
            } else {
                router.chatConversationId = nil
            }
        }
        .onAppear {
            syncRouterConversation()
            router.chatDetailActive = !path.isEmpty
        }
        .onReceive(viewModel.$unreadCount) { unreadCount in
            router.chatUnreadCount = unreadCount
        }
    }

    private func syncRouterConversation() {
        guard let conversationId = router.chatConversationId, !conversationId.isEmpty else {
            path = []
            return
        }
        path = [conversationId]
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            LoadingContent(title: "채팅 목록을 불러오는 중입니다.")
        } else if let errorMessage = viewModel.errorMessage {
            ErrorContent(message: errorMessage) {
                Task { await viewModel.load() }
            }
        } else if viewModel.conversations.isEmpty {
            EmptyContent(
                title: "아직 대화가 없어요",
                bodyText: "게시글에서 문의하거나 지원하면 채팅방이 만들어집니다.",
                actionTitle: "홈으로 가기"
            ) {
                router.selectedTab = .home
            }
        } else {
            List(viewModel.conversations) { conversation in
                Button {
                    path = [conversation.id]
                } label: {
                    ChatRow(conversation: conversation)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
                .listRowSeparator(.hidden)
                .listRowBackground(ManwonColor.surface)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .animation(ManwonMotion.fade, value: viewModel.conversations.count)
            .refreshable {
                await viewModel.load()
            }
            .background(ManwonColor.surface)
        }
    }
}

private struct ChatPageHeader: View {
    let title: String

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ManwonColor.surface)
    }
}

private struct ChatRow: View {
    let conversation: Conversation
    private let avatarSize: CGFloat = 84

    var body: some View {
        HStack(spacing: 14) {
            ChatListAvatar(
                imageUrl: conversation.otherAvatarUrl,
                gender: conversation.otherGender,
                size: avatarSize
            )

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 8) {
                    Text(conversation.otherNickname ?? "상대방")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                    Pill(text: statusText(conversation), active: !conversation.isClosed)
                    Spacer()
                    Text(compactDateText(conversation.lastMessageAt))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(ManwonColor.muted)
                }

                Text(conversation.lastMessage ?? "새 채팅방이 생성되었어요.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(ManwonColor.muted)
                    .lineLimit(1)
            }

            if let unread = conversation.unreadCount, unread > 0 {
                Text(unread > 9 ? "9+" : "\(unread)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(ManwonColor.brand)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

private struct ChatListAvatar: View {
    let imageUrl: String?
    let gender: String?
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(ManwonColor.brandSoft)

            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        fallbackIcon
                    }
                }
            } else {
                fallbackIcon
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var url: URL? {
        let preferredUrl = imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let preferredUrl, !preferredUrl.isEmpty {
            return APIClient.shared.absoluteURLString(preferredUrl).flatMap(URL.init(string:))
        }
        return defaultProfileImagePath(gender: gender)
            .flatMap { APIClient.shared.absoluteURLString($0) }
            .flatMap(URL.init(string:))
    }

    private var fallbackIcon: some View {
        Image(systemName: "person.fill")
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(ManwonColor.brand)
    }
}

private func defaultProfileImagePath(gender: String?) -> String? {
    switch gender {
    case "male":
        return "/profile/man.png"
    case "female":
        return "/profile/woman.png"
    default:
        return nil
    }
}

@MainActor
final class ChatDetailViewModel: ObservableObject {
    let conversationId: String
    @Published var conversation: Conversation?
    @Published var messages: [Message] = []
    @Published var currentUserId: String?
    @Published var draft = ""
    @Published var isLoading = true
    @Published var isSending = false
    @Published var otherTyping = false
    @Published var pendingTradeAction: String?
    @Published var errorMessage: String?
    private var realtimeSubscription: ConversationRealtimeSubscription?
    private var localTypingState = false
    private var lastTypingBroadcastAt = Date.distantPast
    private var localTypingIdleTask: Task<Void, Never>?
    private var remoteTypingIdleTask: Task<Void, Never>?

    init(conversationId: String) {
        self.conversationId = conversationId
    }

    func load(silent: Bool = false) async {
        if !silent { isLoading = true }
        do {
            async let sessionTask = APIClient.shared.fetchSession()
            async let conversationsTask = APIClient.shared.fetchConversations()
            async let messagesTask = APIClient.shared.fetchMessages(conversationId: conversationId)

            let sessionResult = try await sessionTask
            let conversationList = try await conversationsTask
            currentUserId = sessionResult.userId
            conversation = conversationList.first { $0.id == conversationId }
            messages = try await messagesTask
            try? await APIClient.shared.markConversationRead(conversationId: conversationId)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func poll() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            await load(silent: true)
        }
    }

    func startRealtime() async {
        stopRealtime()
        let subscription = ConversationRealtimeSubscription(
            conversationId: conversationId,
            onChange: { [weak self] in
                Task {
                    await self?.load(silent: true)
                }
            },
            onTyping: { [weak self] state in
                self?.handleRemoteTyping(state)
            }
        )
        realtimeSubscription = subscription
        do {
            try await subscription.connect()
        } catch {
            // Polling remains as a fallback if realtime is unavailable.
        }
    }

    func stopRealtime() {
        if localTypingState {
            broadcastTyping(false)
        }
        localTypingIdleTask?.cancel()
        remoteTypingIdleTask?.cancel()
        otherTyping = false
        realtimeSubscription?.disconnect()
        realtimeSubscription = nil
    }

    func loadMessagesAfterLatest() async {
        do {
            let latestCreatedAt = messages.last { !$0.id.hasPrefix("pending-") }?.createdAt
            let incoming = try await APIClient.shared.fetchMessages(conversationId: conversationId, after: latestCreatedAt)
            mergeMessages(incoming)
            try? await APIClient.shared.markConversationRead(conversationId: conversationId)
        } catch {
            // Realtime refresh is best-effort; the fallback poll will catch up.
        }
    }

    func sendText() async {
        await sendMessageText(draft, clearDraft: true)
    }

    func sendQuickMessage(_ text: String) async {
        await sendMessageText(text, clearDraft: false)
    }

    private func sendMessageText(_ rawText: String, clearDraft: Bool) async {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSendMessages, !text.isEmpty, !isSending else { return }
        broadcastTyping(false)
        isSending = true
        if clearDraft {
            draft = ""
        }
        let clientMessageId = UUID().uuidString
        let pending = Message(
            id: "pending-\(clientMessageId)",
            conversationId: conversationId,
            senderId: currentUserId ?? "me",
            messageType: .text,
            body: text,
            imageUrl: nil,
            clientMessageId: clientMessageId,
            deliveredAt: nil,
            readAt: nil,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        messages.append(pending)

        do {
            let sent = try await APIClient.shared.sendTextMessage(conversationId: conversationId, body: text, clientMessageId: clientMessageId)
            messages.removeAll { $0.clientMessageId == clientMessageId }
            messages.append(sent)
            mergeMessages([])
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    func draftDidChange(_ value: String) {
        guard canSendMessages else {
            broadcastTyping(false)
            return
        }
        let isTyping = !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if isTyping {
            let shouldSend = !localTypingState || Date().timeIntervalSince(lastTypingBroadcastAt) > 2
            if shouldSend {
                broadcastTyping(true)
            }
            localTypingIdleTask?.cancel()
            localTypingIdleTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                await MainActor.run {
                    self?.broadcastTyping(false)
                }
            }
            return
        }

        localTypingIdleTask?.cancel()
        if localTypingState {
            broadcastTyping(false)
        }
    }

    private func broadcastTyping(_ isTyping: Bool) {
        localTypingState = isTyping
        lastTypingBroadcastAt = Date()
        guard let userId = currentUserId else { return }
        Task { [weak self] in
            try? await self?.realtimeSubscription?.sendTyping(userId: userId, isTyping: isTyping)
        }
    }

    private func handleRemoteTyping(_ state: ConversationTypingState) {
        let userId = state.userId
        guard userId != nil, userId != currentUserId else { return }
        let isTyping = state.isTyping
        otherTyping = isTyping
        remoteTypingIdleTask?.cancel()
        if isTyping {
            remoteTypingIdleTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await MainActor.run {
                    self?.otherTyping = false
                }
            }
        }
    }

    func sendImage(data: Data) async {
        guard canSendMessages, !isSending else { return }
        isSending = true
        do {
            let clientMessageId = UUID().uuidString
            let upload = try await APIClient.shared.uploadImage(
                data: data,
                fileName: "chat-\(clientMessageId).jpg",
                mimeType: "image/jpeg",
                target: "chat-message"
            )
            let sent = try await APIClient.shared.sendImageMessage(
                conversationId: conversationId,
                imageUrl: upload.imageUrl,
                clientMessageId: clientMessageId
            )
            messages.append(sent)
            mergeMessages([])
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    var canSendMessages: Bool {
        conversation != nil && composerBlockedReason == nil
    }

    fileprivate var composerBlockedReason: ChatComposerBlockedReason? {
        guard let conversation else { return nil }
        if conversation.hasPendingApplicationBeforeAcceptance { return .pendingApplication }
        if conversation.isClosed { return .closed }
        return nil
    }

    fileprivate var quickMessageSuggestions: [QuickMessageSuggestion] {
        guard canSendMessages, shouldShowQuickMessageSuggestions, let conversation else { return [] }
        let suggestions = conversation.quickMessageSuggestionTexts(currentUserId: currentUserId)

        return suggestions.reduce(into: [QuickMessageSuggestion]()) { result, text in
            guard !result.contains(where: { $0.text == text }) else { return }
            result.append(QuickMessageSuggestion(text: text))
        }
    }

    private var shouldShowQuickMessageSuggestions: Bool {
        guard let currentUserId else { return false }
        return !messages.contains { message in
            message.senderId == currentUserId && message.messageType != .system
        }
    }

    func updateDealStatus(_ status: DealStatus) async -> Bool {
        guard let dealId = conversation?.dealId, pendingTradeAction == nil else { return false }
        pendingTradeAction = status.rawValue
        defer { pendingTradeAction = nil }
        do {
            try await APIClient.shared.updateDealStatus(dealId: dealId, status: status)
            await load(silent: true)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func updateApplicationStatus(_ status: String) async -> Bool {
        guard let applicationId = conversation?.applicationId, pendingTradeAction == nil else { return false }
        pendingTradeAction = status
        defer { pendingTradeAction = nil }
        do {
            try await APIClient.shared.updateApplicationStatus(applicationId: applicationId, status: status)
            await load(silent: true)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func createReview(rating: Int, content: String) async -> Bool {
        guard let dealId = conversation?.dealId else { return false }
        do {
            let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
            try await APIClient.shared.createReview(dealId: dealId, rating: rating, content: trimmed.isEmpty ? nil : trimmed)
            await load(silent: true)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func scheduleReviewReminder() async -> Bool {
        guard let dealId = conversation?.dealId else { return false }
        do {
            try await APIClient.shared.scheduleReviewReminder(dealId: dealId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func mergeMessages(_ incoming: [Message]) {
        for message in incoming {
            messages.removeAll { existing in
                existing.id == message.id || (message.clientMessageId != nil && existing.clientMessageId == message.clientMessageId)
            }
            messages.append(message)
        }
        messages.sort { left, right in
            left.createdAt < right.createdAt
        }
    }
}

private enum ChatTradeAction: Identifiable, Equatable {
    case deal(DealStatus)
    case application(String)

    var id: String {
        switch self {
        case .deal(let status): return "deal:\(status.rawValue)"
        case .application(let status): return "application:\(status)"
        }
    }

    var title: String {
        switch self {
        case .application("accepted"):
            return "지원자를 수락할까요?"
        case .application("rejected"):
            return "지원을 거절할까요?"
        case .deal(.completed):
            return "완료 승인할까요?"
        case .deal(.disputed):
            return "문제를 신고할까요?"
        case .deal(.completeRequested):
            return "완료 요청을 보낼까요?"
        case .deal(.cancelled):
            return "거래를 취소할까요?"
        case .deal(.inProgress):
            return "거래를 시작할까요?"
        default:
            return "상태를 변경할까요?"
        }
    }

    var message: String {
        switch self {
        case .application("accepted"):
            return "수락하면 거래가 만들어지고 채팅에서 진행을 시작할 수 있습니다."
        case .application("rejected"):
            return "거절 후에는 이 채팅에서 거래를 진행할 수 없습니다."
        case .deal(.completed):
            return "승인하면 거래가 완료되고 후기 작성 단계로 넘어갑니다."
        case .deal(.disputed):
            return "거래에 문제가 있으면 신고 상태로 전환됩니다."
        case .deal(.completeRequested):
            return "작업이 끝났다면 작성자에게 완료 승인을 요청합니다."
        case .deal(.cancelled):
            return "취소 후에는 이 거래를 다시 진행할 수 없습니다."
        case .deal(.inProgress):
            return "시작 후 지원자가 완료 요청을 보낼 수 있습니다."
        default:
            return "이 작업은 거래 상태에 바로 반영됩니다."
        }
    }

    var confirmTitle: String {
        switch self {
        case .application("accepted"):
            return "수락하기"
        case .application("rejected"):
            return "거절하기"
        case .deal(.completed):
            return "완료 승인"
        case .deal(.disputed):
            return "신고하기"
        case .deal(.completeRequested):
            return "요청 보내기"
        case .deal(.cancelled):
            return "취소하기"
        case .deal(.inProgress):
            return "시작하기"
        default:
            return "확인"
        }
    }
}

struct ChatDetailView: View {
    private static let scrollBottomAnchorId = "chat-scroll-bottom-anchor"

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    @StateObject private var viewModel: ChatDetailViewModel
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showProfileSheet = false
    @State private var showReviewPrompt = false
    @State private var pendingTradeConfirmation: ChatTradeAction?
    @State private var pendingQuickMessage: QuickMessageSuggestion?
    @FocusState private var composerFocused: Bool

    init(conversationId: String) {
        _viewModel = StateObject(wrappedValue: ChatDetailViewModel(conversationId: conversationId))
    }

    var body: some View {
        VStack(spacing: 0) {
            ChatDetailHeader(title: viewModel.conversation?.otherNickname ?? "채팅", onProfile: {
                showProfileSheet = true
            }) {
                dismiss()
            }
            .simultaneousGesture(TapGesture().onEnded {
                dismissComposerKeyboard()
            })
            content
        }
            .background(ManwonColor.background)
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
            .simultaneousGesture(swipeBackGesture)
            .task {
                await viewModel.load()
                syncReviewPrompt()
                await viewModel.startRealtime()
                await viewModel.poll()
            }
            .onDisappear {
                viewModel.stopRealtime()
            }
            .alert("알림", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button("확인", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .onChange(of: selectedPhoto) { item in
                guard let item else { return }
                Task {
                    if viewModel.canSendMessages, let data = try? await item.loadTransferable(type: Data.self) {
                        await viewModel.sendImage(data: data)
                    }
                    selectedPhoto = nil
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .manwonConversationPushReceived)) { notification in
                guard notification.userInfo?["conversationId"] as? String == viewModel.conversationId else { return }
                Task {
                    await viewModel.load(silent: true)
                    syncReviewPrompt()
                }
            }
            .onChange(of: viewModel.conversation?.dealStatus) { _ in
                syncReviewPrompt()
            }
            .onChange(of: viewModel.conversation?.myReviewId) { _ in
                syncReviewPrompt()
            }
            .overlay {
                if let action = pendingTradeConfirmation {
                    TradeActionConfirmationOverlay(
                        action: action,
                        onCancel: {
                            pendingTradeConfirmation = nil
                        },
                        onConfirm: {
                            confirmTradeAction(action)
                        }
                    )
                }
                if let quickMessage = pendingQuickMessage {
                    QuickMessageConfirmationOverlay(
                        message: quickMessage.text,
                        onCancel: {
                            pendingQuickMessage = nil
                        },
                        onConfirm: {
                            confirmQuickMessage(quickMessage)
                        }
                    )
                }
                if showReviewPrompt, let conversation = viewModel.conversation {
                    ReviewPromptOverlay(
                        conversation: conversation,
                        onLater: {
                            if await viewModel.scheduleReviewReminder(), let dealId = conversation.dealId {
                                deferReviewPrompt(dealId: dealId)
                                showReviewPrompt = false
                            }
                        },
                        onSubmit: { rating, content in
                            if await viewModel.createReview(rating: rating, content: content), let dealId = conversation.dealId {
                                clearDeferredReview(dealId: dealId)
                                showReviewPrompt = false
                            }
                        }
                    )
                }
            }
            .sheet(isPresented: $showProfileSheet) {
                if let conversation = viewModel.conversation {
                    ChatProfileSheet(conversation: conversation)
                        .presentationDetents([.large])
                        .presentationDragIndicator(.visible)
                }
            }
    }

    private var swipeBackGesture: some Gesture {
        DragGesture(minimumDistance: 18, coordinateSpace: .local)
            .onEnded { value in
                guard pendingTradeConfirmation == nil, pendingQuickMessage == nil, !showReviewPrompt else { return }
                guard shouldDismissForSwipeBack(value) else { return }

                dismissComposerKeyboard()
                dismiss()
            }
    }

    private func shouldDismissForSwipeBack(_ value: DragGesture.Value) -> Bool {
        let edgeWidth: CGFloat = 34
        let minimumTranslation: CGFloat = 54
        let minimumPredictedTranslation: CGFloat = 120
        let horizontalMovement = value.translation.width
        let verticalMovement = abs(value.translation.height)

        return value.startLocation.x <= edgeWidth
            && horizontalMovement > minimumTranslation
            && value.predictedEndTranslation.width > minimumPredictedTranslation
            && horizontalMovement > verticalMovement * 1.35
    }

    private func dismissComposerKeyboard() {
        if composerFocused {
            composerFocused = false
        }
    }

    private func confirmTradeAction(_ action: ChatTradeAction) {
        pendingTradeConfirmation = nil
        Task {
            let succeeded: Bool
            switch action {
            case .deal(let status):
                succeeded = await viewModel.updateDealStatus(status)
            case .application(let status):
                succeeded = await viewModel.updateApplicationStatus(status)
            }
            if succeeded {
                permissionPrompts.requestPush(context: .dealAction)
            }
        }
    }

    private func confirmQuickMessage(_ quickMessage: QuickMessageSuggestion) {
        pendingQuickMessage = nil
        dismissComposerKeyboard()
        Task {
            await viewModel.sendQuickMessage(quickMessage.text)
        }
    }

    private func syncReviewPrompt() {
        guard
            let conversation = viewModel.conversation,
            conversation.dealStatus == .completed,
            let dealId = conversation.dealId,
            conversation.myReviewId == nil
        else {
            showReviewPrompt = false
            return
        }

        if let deferredUntil = deferredReviewUntil(dealId: dealId), Date().timeIntervalSince1970 < deferredUntil {
            showReviewPrompt = false
            return
        }

        showReviewPrompt = true
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            LoadingContent(title: "채팅방을 불러오는 중입니다.")
        } else if viewModel.conversation == nil {
            EmptyContent(title: "채팅방을 찾지 못했어요")
        } else {
            VStack(spacing: 0) {
                if let conversation = viewModel.conversation {
                    TradeActionPanel(conversation: conversation, viewModel: viewModel) {
                        showProfileSheet = true
                    } onRequestConfirmation: { action in
                        dismissComposerKeyboard()
                        pendingTradeConfirmation = action
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 10)
                    .background(ManwonColor.background)
                    .simultaneousGesture(TapGesture().onEnded {
                        dismissComposerKeyboard()
                    })
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message, isMine: message.senderId == viewModel.currentUserId)
                                    .id(message.id)
                            }
                            if viewModel.otherTyping {
                                TypingIndicatorBubble()
                                    .id("typing-indicator")
                            }
                            Color.clear
                                .frame(height: 1)
                                .id(Self.scrollBottomAnchorId)
                        }
                        .padding(.bottom, 12)
                    }
                    .background(ManwonColor.background)
                    .scrollDismissesKeyboard(.never)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        dismissComposerKeyboard()
                    }
                    .onAppear {
                        scrollToBottom(proxy, animated: false, delays: [0, 0.05])
                    }
                    .onChange(of: viewModel.messages.last?.id) { _ in
                        scrollToBottom(proxy, animated: true, delays: [0, 0.08, 0.22])
                    }
                    .onChange(of: viewModel.otherTyping) { _ in
                        scrollToBottom(proxy, animated: true, delays: [0, 0.08])
                    }
                    .onChange(of: composerFocused) { focused in
                        guard focused else { return }
                        scrollToBottom(proxy, animated: true, delays: [0.05, 0.22, 0.42])
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                        scrollToBottom(proxy, animated: true, delays: [0.05, 0.22, 0.42])
                    }
                    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                        scrollToBottom(proxy, animated: true)
                    }
                }

                if !viewModel.quickMessageSuggestions.isEmpty {
                    QuickMessageCTABar(suggestions: viewModel.quickMessageSuggestions) { suggestion in
                        dismissComposerKeyboard()
                        pendingQuickMessage = suggestion
                    }
                }

                ComposerBar(
                    draft: $viewModel.draft,
                    blockedReason: viewModel.composerBlockedReason,
                    isSending: viewModel.isSending,
                    selectedPhoto: $selectedPhoto,
                    focused: $composerFocused
                ) {
                    Task {
                        await viewModel.sendText()
                        await MainActor.run {
                            if viewModel.canSendMessages {
                                composerFocused = true
                            }
                        }
                    }
                }
                .onChange(of: viewModel.draft) { value in
                    viewModel.draftDidChange(value)
                }
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool, delays: [TimeInterval] = [0]) {
        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                scrollToBottomNow(proxy, animated: animated)
            }
        }
    }

    private func scrollToBottomNow(_ proxy: ScrollViewProxy, animated: Bool) {
        if animated {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(Self.scrollBottomAnchorId, anchor: .bottom)
            }
        } else {
            proxy.scrollTo(Self.scrollBottomAnchorId, anchor: .bottom)
        }
    }
}

private struct TradeActionConfirmationOverlay: View {
    let action: ChatTradeAction
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture(perform: onCancel)

            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(action.title)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                    Text(action.message)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(ManwonColor.muted)
                        .lineSpacing(2)
                }

                HStack(spacing: 10) {
                    Button("돌아가기", action: onCancel)
                        .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                    Button(action.confirmTitle, action: onConfirm)
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
            .padding(20)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 18)
            .shadow(color: .black.opacity(0.18), radius: 28, y: 14)
        }
    }
}

private struct ReviewPromptOverlay: View {
    let conversation: Conversation
    let onLater: () async -> Void
    let onSubmit: (Int, String) async -> Void
    @State private var rating = 5
    @State private var content = ""
    @State private var busyAction: String?

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("거래 후기를 남겨주세요")
                            .font(.system(size: 21, weight: .bold))
                            .foregroundStyle(ManwonColor.text)
                        Text("\(conversation.otherNickname ?? "상대방")님과의 거래는 어떠셨나요?")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(ManwonColor.muted)
                    }
                    Spacer()
                    Button {
                        Task { await runLater() }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(ManwonColor.muted)
                            .frame(width: 32, height: 32)
                    }
                    .disabled(busyAction != nil)
                }

                HStack(spacing: 7) {
                    ForEach(1...5, id: \.self) { value in
                        Button {
                            rating = value
                        } label: {
                            Image(systemName: "star.fill")
                                .font(.system(size: 27, weight: .bold))
                                .foregroundStyle(value <= rating ? Color.orange : Color(red: 0.78, green: 0.78, blue: 0.82))
                                .frame(width: 42, height: 42)
                                .background(value <= rating ? Color.orange.opacity(0.11) : Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(value <= rating ? Color.orange.opacity(0.28) : ManwonColor.line, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("후기")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                    TextEditor(text: $content)
                        .frame(minHeight: 110)
                        .padding(8)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(ManwonColor.line, lineWidth: 1)
                        )
                    Text("\(content.count)/1000")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(ManwonColor.muted)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                HStack(spacing: 10) {
                    Button(busyAction == "later" ? "설정 중" : "나중에") {
                        Task { await runLater() }
                    }
                    .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                    .disabled(busyAction != nil)
                    Button(busyAction == "submit" ? "저장 중" : "후기 남기기") {
                        Task { await runSubmit() }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busyAction != nil)
                }
            }
            .padding(20)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 18)
            .shadow(color: .black.opacity(0.18), radius: 28, y: 14)
        }
    }

    private func runLater() async {
        guard busyAction == nil else { return }
        busyAction = "later"
        await onLater()
        busyAction = nil
    }

    private func runSubmit() async {
        guard busyAction == nil else { return }
        busyAction = "submit"
        await onSubmit(rating, String(content.prefix(1000)))
        busyAction = nil
    }
}

private func reviewPromptDefaultsKey(dealId: String) -> String {
    "manwon_review_prompt_deferred_until:\(dealId)"
}

private func deferredReviewUntil(dealId: String) -> TimeInterval? {
    let value = UserDefaults.standard.double(forKey: reviewPromptDefaultsKey(dealId: dealId))
    return value > 0 ? value : nil
}

private func deferReviewPrompt(dealId: String) {
    UserDefaults.standard.set(Date().addingTimeInterval(24 * 60 * 60).timeIntervalSince1970, forKey: reviewPromptDefaultsKey(dealId: dealId))
}

private func clearDeferredReview(dealId: String) {
    UserDefaults.standard.removeObject(forKey: reviewPromptDefaultsKey(dealId: dealId))
}

private struct ChatDetailHeader: View {
    let title: String
    let onProfile: () -> Void
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(ManwonColor.text)
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.8))

            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(ManwonColor.text)
                .lineLimit(1)
                .frame(maxWidth: .infinity)

            Button(action: onProfile) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(ManwonColor.text)
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.8))
            .accessibilityLabel("상대방 프로필 보기")
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(ManwonColor.surface)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(ManwonColor.line)
                .frame(height: 1)
        }
    }
}

private struct ChatProfileSheet: View {
    let conversation: Conversation
    private let photoColumns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
    @State private var selectedPhoto: ProfilePhotoPreview?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 13) {
                    ChatProfileAvatar(
                        imageUrl: conversation.otherAvatarUrl,
                        fallbackText: String((conversation.otherNickname ?? "상대").prefix(1))
                    )

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(conversation.otherNickname ?? "상대방")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(ManwonColor.text)
                                .lineLimit(1)
                            if let genderText {
                                Text(genderText)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(ManwonColor.muted)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(red: 0.95, green: 0.95, blue: 0.96))
                                    .clipShape(Capsule())
                            }
                        }
                        Text(intro)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(ManwonColor.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .lineSpacing(2)
                    }
                }

                HStack(spacing: 10) {
                    ProfileMetric(title: "평점", value: ratingText)
                    ProfileMetric(title: "거래 완료", value: "\(conversation.otherCompletedCount ?? 0)회")
                    ProfileMetric(title: "후기", value: "\(conversation.otherReviewCount ?? 0)개")
                }

                if hasProfileDetails {
                    VStack(alignment: .leading, spacing: 12) {
                        if let careerSummary {
                            ProfileDetailSection(title: "경력 한 줄") {
                                Text(careerSummary)
                            }
                        }

                        if let careerDescription {
                            ProfileDetailSection(title: "상세 소개") {
                                Text(careerDescription)
                            }
                        }

                        if !portfolioLinks.isEmpty {
                            ProfileDetailSection(title: "링크") {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(Array(portfolioLinks.enumerated()), id: \.offset) { _, link in
                                        Link(destination: link.url) {
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text(link.title.isEmpty ? linkDisplayName(link.url) : link.title)
                                                    .font(.system(size: 13, weight: .bold))
                                                    .foregroundStyle(ManwonColor.text)
                                                Text(link.url.absoluteString)
                                                    .font(.system(size: 12, weight: .semibold))
                                                    .foregroundStyle(ManwonColor.brand)
                                                    .lineLimit(1)
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(12)
                                            .background(Color(red: 0.97, green: 0.97, blue: 0.975))
                                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        }
                                    }
                                }
                            }
                        }

                        if !workSampleImageURLs.isEmpty {
                            ProfileDetailSection(title: "사진") {
                                LazyVGrid(columns: photoColumns, spacing: 8) {
                                    ForEach(Array(workSampleImageURLs.enumerated()), id: \.offset) { _, url in
                                        Button {
                                            selectedPhoto = ProfilePhotoPreview(url: url)
                                        } label: {
                                            ProfileSampleImageCell(url: url)
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel("사진 크게 보기")
                                    }
                                }
                            }
                        }

                        if let responseTime {
                            ProfileInfoRow(title: "응답", value: responseTime)
                        }

                        if hasVerification {
                            HStack(spacing: 8) {
                                if conversation.otherPhoneVerified == true {
                                    ProfileBadge(text: "휴대폰 인증")
                                }
                                if conversation.otherIdentityVerified == true {
                                    ProfileBadge(text: "본인 인증")
                                }
                                if conversation.otherPhoneVerified != true && conversation.otherIdentityVerified != true {
                                    ProfileBadge(text: "인증 완료")
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 22)
            .padding(.bottom, 28)
        }
        .background(ManwonColor.surface)
        .fullScreenCover(item: $selectedPhoto) { photo in
            ProfilePhotoViewer(url: photo.url) {
                selectedPhoto = nil
            }
        }
    }

    private var ratingText: String {
        guard let rating = conversation.otherRatingAvg, rating > 0 else { return "신규" }
        return String(format: "%.1f", rating)
    }

    private var intro: String {
        trimmed(conversation.otherBio) ?? "아직 소개가 없습니다."
    }

    private var careerSummary: String? {
        trimmed(conversation.otherCareerSummary)
    }

    private var careerDescription: String? {
        trimmed(conversation.otherCareerDescription)
    }

    private var responseTime: String? {
        trimmed(conversation.otherResponseTime)
    }

    private var portfolioLinks: [(title: String, url: URL)] {
        (conversation.otherPortfolioLinks ?? []).compactMap { link in
            guard
                let rawURL = trimmed(link.url),
                let url = URL(string: rawURL),
                url.scheme != nil
            else {
                return nil
            }
            return (trimmed(link.title) ?? "", url)
        }
    }

    private var workSampleImageURLs: [URL] {
        (conversation.otherWorkSampleImages ?? []).compactMap { image in
            guard
                let absolute = APIClient.shared.absoluteURLString(image.imageUrl),
                let url = URL(string: absolute)
            else {
                return nil
            }
            return url
        }
    }

    private var hasVerification: Bool {
        conversation.otherPhoneVerified == true || conversation.otherIdentityVerified == true
    }

    private var hasProfileDetails: Bool {
        careerSummary != nil
            || careerDescription != nil
            || !portfolioLinks.isEmpty
            || !workSampleImageURLs.isEmpty
            || responseTime != nil
            || hasVerification
    }

    private var genderText: String? {
        if conversation.otherGender == "male" { return "남성" }
        if conversation.otherGender == "female" { return "여성" }
        return nil
    }

    private func trimmed(_ value: String?) -> String? {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }

    private func linkDisplayName(_ url: URL) -> String {
        url.host?.replacingOccurrences(of: "www.", with: "") ?? url.absoluteString
    }
}

private struct ProfilePhotoPreview: Identifiable {
    let url: URL

    var id: String {
        url.absoluteString
    }
}

private struct ProfilePhotoViewer: View {
    let url: URL
    let onClose: () -> Void
    @State private var scale: CGFloat = 1
    @GestureState private var gestureScale: CGFloat = 1

    private var effectiveScale: CGFloat {
        min(max(scale * gestureScale, 1), 4)
    }

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    VStack(spacing: 12) {
                        Image(systemName: "photo")
                            .font(.system(size: 36, weight: .semibold))
                        Text("사진을 불러오지 못했습니다.")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(Color.white.opacity(0.78))
                default:
                    ProgressView()
                        .tint(.white)
                }
            }
            .scaleEffect(effectiveScale)
            .animation(.spring(response: 0.24, dampingFraction: 0.86), value: scale)
            .gesture(
                MagnificationGesture()
                    .updating($gestureScale) { value, state, _ in
                        state = value
                    }
                    .onEnded { value in
                        scale = min(max(scale * value, 1), 4)
                    }
            )
            .onTapGesture(count: 2) {
                scale = scale > 1 ? 1 : 2.4
            }
        }
        .overlay(alignment: .topTrailing) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 42, height: 42)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Circle())
            }
            .padding(.top, 18)
            .padding(.trailing, 18)
            .accessibilityLabel("사진 닫기")
        }
        .statusBarHidden()
    }
}

private struct ChatProfileAvatar: View {
    let imageUrl: String?
    let fallbackText: String

    var body: some View {
        ZStack {
            Circle()
                .fill(ManwonColor.brandSoft)

            if
                let absolute = APIClient.shared.absoluteURLString(imageUrl),
                let url = URL(string: absolute)
            {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(Circle())
    }

    private var fallback: some View {
        Text(fallbackText.isEmpty ? "만" : fallbackText)
            .font(.system(size: 23, weight: .bold))
            .foregroundStyle(ManwonColor.brand)
    }
}

private struct ProfileDetailSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            content
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(ManwonColor.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(red: 0.98, green: 0.98, blue: 0.985))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct ProfileInfoRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
        }
        .padding(13)
        .background(Color(red: 0.97, green: 0.97, blue: 0.975))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

private struct ProfileSampleImageCell: View {
    let url: URL

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            default:
                Rectangle()
                    .fill(ManwonColor.brandSoft)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fill)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct ProfileMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 5) {
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(ManwonColor.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(ManwonColor.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

private struct ProfileBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(ManwonColor.brand)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(ManwonColor.brandSoft)
            .clipShape(Capsule())
    }
}

private struct TradeActionPanel: View {
    let conversation: Conversation
    @ObservedObject var viewModel: ChatDetailViewModel
    let onProfile: () -> Void
    let onRequestConfirmation: (ChatTradeAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(ManwonColor.text)
            if showsProfilePrompt {
                Button(action: onProfile) {
                    HStack {
                        Text("수락 전에 지원자 프로필을 확인해보세요.")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(ManwonColor.muted)
                        Spacer()
                        Text("프로필 보기")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(ManwonColor.brand)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(ManwonColor.brandSoft.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(PressableScaleButtonStyle(scale: 0.98, pressedOpacity: 0.86))
            }
            actions
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ManwonColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ManwonColor.line, lineWidth: 1)
        )
    }

    private var title: String {
        if conversation.dealStatus == .completed { return "거래가 완료되었어요." }
        if conversation.dealStatus == .cancelled { return "거래가 취소되었어요." }
        if conversation.applicationStatus == "rejected" { return "지원이 거절되었어요." }
        if conversation.applicationStatus == "cancelled" { return "지원이 취소되었어요." }
        if hasPendingApplication && !isPostWriter { return "지원 수락을 기다리고 있어요." }
        if conversation.dealStatus == .completeRequested {
            return isPostWriter ? "지원자가 완료 요청을 보냈어요." : "완료 요청을 보냈어요."
        }
        if conversation.dealStatus == .accepted {
            return isPostWriter ? "거래를 시작할 수 있어요." : "작성자의 진행 시작을 기다리고 있어요."
        }
        if conversation.dealStatus == .inProgress {
            return isApplicant ? "완료 요청을 보낼 수 있어요." : "진행 중인 거래입니다."
        }
        if conversation.applicationId != nil { return "지원 요청이 도착했어요." }
        return conversation.postTitle ?? "거래 대화"
    }

    private var postCreatorId: String? {
        conversation.postCreatorId ?? conversation.requesterId
    }

    private var isPostWriter: Bool {
        postCreatorId == viewModel.currentUserId
    }

    private var isApplicant: Bool {
        guard let currentUserId = viewModel.currentUserId, let postCreatorId else { return false }
        return currentUserId != postCreatorId
    }

    private var hasPendingApplication: Bool {
        conversation.applicationId != nil && conversation.applicationStatus == "applied" && conversation.dealId == nil
    }

    private var showsProfilePrompt: Bool {
        hasPendingApplication && isPostWriter
    }

    private var hasChatAfterStarted: Bool {
        conversation.hasChatAfterStarted ?? false
    }

    private var busy: Bool {
        viewModel.pendingTradeAction != nil
    }

    private func actionTitle(_ id: String, _ normal: String) -> String {
        guard viewModel.pendingTradeAction == id else { return normal }
        switch id {
        case "accepted": return "수락 중"
        case "rejected": return "거절 중"
        case "in_progress": return "시작 중"
        case "complete_requested": return "요청 중"
        case "completed": return "승인 중"
        case "cancelled": return "취소 중"
        case "disputed": return "신고 중"
        default: return "처리 중"
        }
    }

    private func runDealAction(_ status: DealStatus) {
        onRequestConfirmation(.deal(status))
    }

    private func runApplicationAction(_ status: String) {
        onRequestConfirmation(.application(status))
    }

    @ViewBuilder
    private var actions: some View {
        if conversation.dealStatus == .completeRequested {
            if isPostWriter {
                if hasChatAfterStarted {
                    HStack {
                        Button(actionTitle(DealStatus.completed.rawValue, "완료 승인")) { runDealAction(.completed) }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(busy)
                        Button(actionTitle(DealStatus.disputed.rawValue, "문제 신고")) { runDealAction(.disputed) }
                            .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                            .disabled(busy)
                    }
                } else {
                    Text("진행 시작 후 양쪽 대화가 1턴 이상 있어야 승인할 수 있어요.")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(ManwonColor.muted)
                }
            } else {
                Text("게시글 작성자의 완료 승인을 기다리고 있어요.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ManwonColor.muted)
            }
        } else if conversation.dealStatus == .accepted {
            if isPostWriter {
                HStack {
                    Button(actionTitle(DealStatus.inProgress.rawValue, "진행 시작")) {
                        runDealAction(.inProgress)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy)
                    Button(actionTitle(DealStatus.cancelled.rawValue, "취소")) { runDealAction(.cancelled) }
                        .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                        .disabled(busy)
                }
            } else {
                Text("진행 시작 후 완료 요청을 보낼 수 있습니다.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ManwonColor.muted)
            }
        } else if conversation.dealStatus == .inProgress {
            if isApplicant {
                HStack {
                    Button(actionTitle(DealStatus.completeRequested.rawValue, "완료 요청 보내기")) {
                        runDealAction(.completeRequested)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy)
                    Button(actionTitle(DealStatus.cancelled.rawValue, "취소")) { runDealAction(.cancelled) }
                        .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                        .disabled(busy)
                }
            } else {
                Text("지원자가 완료 요청을 보내면 승인할 수 있습니다.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ManwonColor.muted)
            }
        } else if hasPendingApplication && isPostWriter {
            HStack {
                Button(actionTitle("accepted", "수락하기")) { runApplicationAction("accepted") }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy)
                Button(actionTitle("rejected", "거절하기")) { runApplicationAction("rejected") }
                    .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                    .disabled(busy)
            }
        } else if hasPendingApplication {
            Text("작성자가 수락하면 거래가 시작됩니다.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
        } else if conversation.applicationStatus == "rejected" || conversation.applicationStatus == "cancelled" {
            Text("필요하면 게시물 상세에서 다시 지원할 수 있습니다.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
        }
    }
}

private struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        if message.messageType == .system {
            Text(message.body ?? "")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(ManwonColor.muted)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color(red: 0.94, green: 0.94, blue: 0.95))
                .clipShape(Capsule())
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
        } else {
            HStack {
                if isMine { Spacer(minLength: 50) }
                VStack(alignment: isMine ? .trailing : .leading, spacing: 6) {
                    if message.messageType == .image, let imageURL = APIClient.shared.absoluteURLString(message.imageUrl), let url = URL(string: imageURL) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                            default:
                                Rectangle().fill(Color.white.opacity(0.2))
                            }
                        }
                        .frame(width: 210, height: 210)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    if let body = message.body, !body.isEmpty {
                        Text(body)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(isMine ? Color.white : ManwonColor.text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 11)
                            .background(isMine ? ManwonColor.brand : ManwonColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    Text(compactDateText(message.createdAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(ManwonColor.muted)
                }
                if !isMine { Spacer(minLength: 50) }
            }
            .padding(.horizontal, 16)
        }
    }
}

private struct TypingIndicatorBubble: View {
    @State private var animating = false

    var body: some View {
        HStack {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(ManwonColor.muted)
                        .frame(width: 6, height: 6)
                        .offset(y: animating ? -4 : 4)
                        .animation(
                            .easeInOut(duration: 0.48)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.12),
                            value: animating
                        )
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Spacer(minLength: 50)
        }
        .padding(.horizontal, 16)
        .onAppear {
            animating = true
        }
        .onDisappear {
            animating = false
        }
        .accessibilityLabel("상대방이 입력 중")
    }
}

fileprivate extension Conversation {
    var hasPendingApplicationBeforeAcceptance: Bool {
        postType == "request" && applicationId != nil && applicationStatus == "applied" && dealId == nil
    }

    func quickMessageSuggestionTexts(currentUserId: String?) -> [String] {
        guard let currentUserId else { return [] }

        if postType == "offer", requesterId == currentUserId || applicationApplicantId == currentUserId {
            return ["진행방식이 어떻게 되나요?", "자세한 견적 알려주세요!"]
        }
        if postType == "offer", helperId == currentUserId || postCreatorId == currentUserId {
            return ["안녕하세요!", "문의 주셔서 감사합니다!"]
        }

        guard postType == "request", dealId != nil || applicationStatus == "accepted" else { return [] }
        if helperId == currentUserId || applicationApplicantId == currentUserId {
            return ["안녕하세요!", "어떤게 필요하실까요?"]
        }
        if requesterId == currentUserId || postCreatorId == currentUserId {
            return ["안녕하세요!", "잘 부탁드립니다!"]
        }

        return []
    }
}

fileprivate struct QuickMessageSuggestion: Identifiable, Hashable {
    let text: String

    var id: String {
        text
    }
}

fileprivate enum ChatComposerBlockedReason {
    case pendingApplication
    case closed

    var message: String {
        switch self {
        case .pendingApplication:
            return "지원 요청이 수락되면 채팅을 할 수 있습니다."
        case .closed:
            return "종료된 거래라 메시지를 보낼 수 없어요."
        }
    }

    var textColor: Color {
        switch self {
        case .pendingApplication:
            return ManwonColor.brand
        case .closed:
            return ManwonColor.muted
        }
    }
}

private struct QuickMessageCTABar: View {
    let suggestions: [QuickMessageSuggestion]
    let onSelect: (QuickMessageSuggestion) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions) { suggestion in
                    Button {
                        onSelect(suggestion)
                    } label: {
                        Text(suggestion.text)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(ManwonColor.brand)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(ManwonColor.brandSoft)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(PressableScaleButtonStyle(scale: 0.97, pressedOpacity: 0.86))
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(.ultraThinMaterial)
    }
}

private struct QuickMessageConfirmationOverlay: View {
    let message: String
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture(perform: onCancel)

            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("이 문장을 보낼까요?")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                    Text(message)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(ManwonColor.text)
                        .lineSpacing(2)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(red: 0.97, green: 0.97, blue: 0.975))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                HStack(spacing: 10) {
                    Button("돌아가기", action: onCancel)
                        .buttonStyle(PrimaryButtonStyle(isSecondary: true))
                    Button("보내기", action: onConfirm)
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
            .padding(20)
            .background(ManwonColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 18)
            .shadow(color: .black.opacity(0.18), radius: 28, y: 14)
        }
    }
}

private struct ComposerBar: View {
    @Binding var draft: String
    let blockedReason: ChatComposerBlockedReason?
    let isSending: Bool
    @Binding var selectedPhoto: PhotosPickerItem?
    let focused: FocusState<Bool>.Binding
    let send: () -> Void

    private var isBlocked: Bool {
        blockedReason != nil
    }

    var body: some View {
        HStack(spacing: 9) {
            PhotosPicker(selection: $selectedPhoto, matching: .images) {
                Image(systemName: isBlocked ? "lock.fill" : "plus")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(isBlocked ? ManwonColor.muted : ManwonColor.brand)
                    .frame(width: 38, height: 38)
                    .background(isBlocked ? Color(red: 0.94, green: 0.94, blue: 0.95) : ManwonColor.brandSoft)
                    .clipShape(Circle())
            }
            .disabled(isBlocked || isSending)

            Group {
                if let blockedReason {
                    Text(blockedReason.message)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(blockedReason.textColor)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    TextField("메시지를 입력하세요", text: $draft, axis: .vertical)
                        .font(.system(size: 15))
                        .lineLimit(1...4)
                        .focused(focused)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(red: 0.96, green: 0.96, blue: 0.965))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Button(action: send) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 38, height: 38)
                    .background(ManwonColor.brand)
                    .clipShape(Circle())
            }
            .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.85))
            .disabled(isBlocked || isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(isBlocked || isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }
}
