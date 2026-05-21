import PhotosUI
import SwiftUI

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var isLoading = true
    @Published var errorMessage: String?

    func load(silent: Bool = false) async {
        if !silent { isLoading = true }
        do {
            conversations = try await APIClient.shared.fetchConversations()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
            await viewModel.poll()
        }
        .onChange(of: router.chatConversationId) { conversationId in
            guard let conversationId else { return }
            path = [conversationId]
        }
        .onChange(of: path) { value in
            router.chatDetailActive = !value.isEmpty
        }
        .onAppear {
            router.chatDetailActive = !path.isEmpty
        }
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
                    Pill(text: statusText(conversation), active: conversation.dealStatus != .completed && conversation.dealStatus != .cancelled)
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
    @Published var errorMessage: String?

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
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            await load(silent: true)
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
            await load(silent: true)
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
            await load(silent: true)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    func updateDealStatus(_ status: DealStatus) async {
        guard let dealId = conversation?.dealId else { return }
        do {
            try await APIClient.shared.updateDealStatus(dealId: dealId, status: status)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateApplicationStatus(_ status: String) async {
        guard let applicationId = conversation?.applicationId else { return }
        do {
            try await APIClient.shared.updateApplicationStatus(applicationId: applicationId, status: status)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ChatDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: ChatDetailViewModel
    @State private var selectedPhoto: PhotosPickerItem?

    init(conversationId: String) {
        _viewModel = StateObject(wrappedValue: ChatDetailViewModel(conversationId: conversationId))
    }

    var body: some View {
        VStack(spacing: 0) {
            ChatDetailHeader(title: viewModel.conversation?.otherNickname ?? "채팅") {
                dismiss()
            }
            content
        }
            .background(ManwonColor.background)
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await viewModel.load()
                await viewModel.poll()
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
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            LoadingContent(title: "채팅방을 불러오는 중입니다.")
        } else if viewModel.conversation == nil {
            EmptyContent(title: "채팅방을 찾지 못했어요")
        } else {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            if let conversation = viewModel.conversation {
                                TradeActionPanel(conversation: conversation, viewModel: viewModel)
                                    .padding(.horizontal, 16)
                                    .padding(.top, 12)
                            }
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message, isMine: message.senderId == viewModel.currentUserId)
                                    .id(message.id)
                            }
                        }
                        .padding(.bottom, 12)
                    }
                    .background(ManwonColor.background)
                    .onChange(of: viewModel.messages.count) { _ in
                        if let last = viewModel.messages.last {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                ComposerBar(
                    draft: $viewModel.draft,
                    disabled: viewModel.conversation?.isClosed == true || viewModel.isSending,
                    selectedPhoto: $selectedPhoto
                ) {
                    Task { await viewModel.sendText() }
                }
            }
        }
    }
}

private struct ChatDetailHeader: View {
    let title: String
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

            Color.clear
                .frame(width: 42, height: 42)
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

private struct TradeActionPanel: View {
    let conversation: Conversation
    @ObservedObject var viewModel: ChatDetailViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(ManwonColor.text)
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
        if conversation.dealStatus == .completeRequested { return "완료 요청이 도착했어요." }
        if conversation.dealStatus == .accepted { return "거래를 시작할 수 있어요." }
        if conversation.dealStatus == .inProgress { return "진행 중인 거래입니다." }
        if conversation.applicationId != nil { return "지원 요청이 도착했어요." }
        return conversation.postTitle ?? "거래 대화"
    }

    @ViewBuilder
    private var actions: some View {
        if conversation.dealStatus == .completeRequested {
            HStack {
                Button("완료 승인") { Task { await viewModel.updateDealStatus(.completed) } }
                    .buttonStyle(PrimaryButtonStyle())
                Button("문제 신고") { Task { await viewModel.updateDealStatus(.disputed) } }
                    .buttonStyle(PrimaryButtonStyle(isSecondary: true))
            }
        } else if conversation.dealStatus == .accepted || conversation.dealStatus == .inProgress {
            HStack {
                Button(conversation.dealStatus == .accepted ? "진행 시작" : "완료 요청") {
                    Task { await viewModel.updateDealStatus(conversation.dealStatus == .accepted ? .inProgress : .completeRequested) }
                }
                .buttonStyle(PrimaryButtonStyle())
                Button("취소") { Task { await viewModel.updateDealStatus(.cancelled) } }
                    .buttonStyle(PrimaryButtonStyle(isSecondary: true))
            }
        } else if conversation.applicationId != nil && conversation.applicationStatus == "applied" {
            HStack {
                Button("수락하기") { Task { await viewModel.updateApplicationStatus("accepted") } }
                    .buttonStyle(PrimaryButtonStyle())
                Button("거절하기") { Task { await viewModel.updateApplicationStatus("rejected") } }
                    .buttonStyle(PrimaryButtonStyle(isSecondary: true))
            }
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
                .disabled(disabled)

            Button(action: send) {
                Text("전송")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 14)
                    .frame(height: 38)
                    .background(ManwonColor.brand)
                    .clipShape(Capsule())
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
