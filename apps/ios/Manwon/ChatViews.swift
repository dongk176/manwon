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
            .background(ManwonColor.background)
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
                NavigationLink(value: conversation.id) {
                    ChatRow(conversation: conversation)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
            .listStyle(.plain)
            .animation(ManwonMotion.fade, value: viewModel.conversations.count)
            .refreshable {
                await viewModel.load()
            }
            .background(ManwonColor.background)
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

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(ManwonColor.brandSoft)
                .frame(width: 48, height: 48)
                .overlay {
                    Text(String((conversation.otherNickname ?? "상대").prefix(1)))
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(ManwonColor.brand)
                }

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
        .padding(14)
        .background(ManwonColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ManwonColor.line, lineWidth: 1)
        )
        .padding(.vertical, 4)
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
    @Published var pendingTradeAction: String?
    @Published var errorMessage: String?
    private var realtimeSubscription: ConversationRealtimeSubscription?

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
        let subscription = ConversationRealtimeSubscription(conversationId: conversationId) { [weak self] in
            Task {
                await self?.load(silent: true)
            }
        }
        realtimeSubscription = subscription
        do {
            try await subscription.connect()
        } catch {
            // Polling remains as a fallback if realtime is unavailable.
        }
    }

    func stopRealtime() {
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
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        draft = ""
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

    func sendImage(data: Data) async {
        guard !isSending else { return }
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

struct ChatDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: ChatDetailViewModel
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showProfileSheet = false
    @State private var showReviewPrompt = false
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
            content
        }
            .background(ManwonColor.background)
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
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
                    if let data = try? await item.loadTransferable(type: Data.self) {
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
                        .presentationDetents([.height(320), .medium])
                        .presentationDragIndicator(.visible)
                }
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
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 10)
                    .background(ManwonColor.background)
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message, isMine: message.senderId == viewModel.currentUserId)
                                    .id(message.id)
                            }
                        }
                        .padding(.bottom, 12)
                    }
                    .background(ManwonColor.background)
                    .scrollDismissesKeyboard(.interactively)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        composerFocused = false
                        dismissKeyboard()
                    }
                    .onAppear {
                        scrollToBottom(proxy, animated: false)
                    }
                    .onChange(of: viewModel.messages.last?.id) { _ in
                        scrollToBottom(proxy, animated: true)
                    }
                    .onChange(of: composerFocused) { focused in
                        guard focused else { return }
                        scrollToBottom(proxy, animated: true, delay: 0.25)
                    }
                }

                ComposerBar(
                    draft: $viewModel.draft,
                    disabled: viewModel.conversation?.isClosed == true || viewModel.isSending,
                    selectedPhoto: $selectedPhoto,
                    focused: $composerFocused
                ) {
                    Task { await viewModel.sendText() }
                }
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool, delay: TimeInterval = 0) {
        guard let last = viewModel.messages.last else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            if animated {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            } else {
                proxy.scrollTo(last.id, anchor: .bottom)
            }
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

private func dismissKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 13) {
                Circle()
                    .fill(ManwonColor.brandSoft)
                    .frame(width: 58, height: 58)
                    .overlay {
                        Text(String((conversation.otherNickname ?? "상대").prefix(1)))
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(ManwonColor.brand)
                    }

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(conversation.otherNickname ?? "상대방")
                            .font(.system(size: 21, weight: .bold))
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
                    Text(conversation.otherCareerSummary ?? "뭐든해줌 사용자")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(ManwonColor.muted)
                        .lineLimit(2)
                }
            }

            HStack(spacing: 10) {
                ProfileMetric(title: "평점", value: ratingText)
                ProfileMetric(title: "거래 완료", value: "\(conversation.otherCompletedCount ?? 0)회")
                ProfileMetric(title: "후기", value: "\(conversation.otherReviewCount ?? 0)개")
            }

            if let responseTime = conversation.otherResponseTime, !responseTime.isEmpty {
                HStack {
                    Text("응답")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(ManwonColor.text)
                    Spacer()
                    Text(responseTime)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(ManwonColor.muted)
                }
                .padding(13)
                .background(Color(red: 0.97, green: 0.97, blue: 0.975))
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            }

            HStack(spacing: 8) {
                if conversation.otherPhoneVerified == true {
                    ProfileBadge(text: "휴대폰 인증")
                }
                if conversation.otherIdentityVerified == true {
                    ProfileBadge(text: "신원 인증")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 20)
    }

    private var ratingText: String {
        guard let rating = conversation.otherRatingAvg, rating > 0 else { return "신규" }
        return String(format: "%.1f", rating)
    }

    private var genderText: String? {
        if conversation.otherGender == "male" { return "남성" }
        if conversation.otherGender == "female" { return "여성" }
        return nil
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
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    let conversation: Conversation
    @ObservedObject var viewModel: ChatDetailViewModel
    let onProfile: () -> Void

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
        Task {
            if await viewModel.updateDealStatus(status) {
                permissionPrompts.requestPush(context: .dealAction)
            }
        }
    }

    private func runApplicationAction(_ status: String) {
        Task {
            if await viewModel.updateApplicationStatus(status) {
                permissionPrompts.requestPush(context: .dealAction)
            }
        }
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

private struct ComposerBar: View {
    @Binding var draft: String
    let disabled: Bool
    @Binding var selectedPhoto: PhotosPickerItem?
    let focused: FocusState<Bool>.Binding
    let send: () -> Void

    var body: some View {
        HStack(spacing: 9) {
            PhotosPicker(selection: $selectedPhoto, matching: .images) {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(ManwonColor.brand)
                    .frame(width: 38, height: 38)
                    .background(ManwonColor.brandSoft)
                    .clipShape(Circle())
            }
            .disabled(disabled)

            TextField(disabled ? "종료된 거래라 메시지를 보낼 수 없어요." : "메시지를 입력하세요", text: $draft, axis: .vertical)
                .font(.system(size: 15))
                .lineLimit(1...4)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(red: 0.96, green: 0.96, blue: 0.965))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .focused(focused)
                .disabled(disabled)

            Button(action: send) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 38, height: 38)
                    .background(ManwonColor.brand)
                    .clipShape(Circle())
            }
            .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.85))
            .disabled(disabled || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(disabled || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }
}
