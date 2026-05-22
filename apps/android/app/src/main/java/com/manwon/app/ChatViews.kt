package com.manwon.app

import android.app.AlertDialog
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Locale
import java.util.UUID

interface ImagePickerHost {
    fun pickImage(onPicked: (ByteArray?) -> Unit)
}

private data class ChatActionConfirmation(
    val title: String,
    val message: String,
    val confirmTitle: String
)

class ChatListView(
    context: Context,
    private val api: APIClient,
    private val openConversation: (String) -> Unit,
    private val openHome: () -> Unit,
    private val onUnreadCountChanged: (Int) -> Unit = {}
) : FrameLayout(context) {
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val content = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(ManwonColors.BACKGROUND)
    }
    private var polling = false

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!polling) return
            load(silent = true)
            handler.postDelayed(this, 8_000)
        }
    }

    init {
        addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        polling = true
        load()
        handler.postDelayed(pollRunnable, 8_000)
    }

    override fun onDetachedFromWindow() {
        polling = false
        handler.removeCallbacks(pollRunnable)
        super.onDetachedFromWindow()
    }

    fun load(silent: Boolean = false) {
        if (!silent) showLoading("채팅 목록을 불러오는 중입니다.")
        runAsync({ api.fetchConversations() }) { result ->
            result
                .onSuccess { conversations -> showConversations(conversations) }
                .onFailure { showError(it.message ?: "채팅 목록을 불러오지 못했습니다.") }
        }
    }

    private fun showConversations(conversations: List<Conversation>) {
        onUnreadCountChanged(totalUnreadCount(conversations))
        content.removeAllViews()
        content.addView(sectionHeader(context, "채팅"))
        if (conversations.isEmpty()) {
            content.addView(emptyView(context, "아직 대화가 없어요", "게시글에서 문의하거나 지원하면 채팅방이 만들어집니다.", "홈으로 가기", openHome))
            return
        }

        val scroll = ScrollView(context).apply { isFillViewport = true }
        val list = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(14), context.dp(8), context.dp(14), context.dp(110))
        }
        conversations.forEachIndexed { index, conversation ->
            list.addView(chatRow(conversation).apply {
                alpha = 0f
                translationY = context.dp(8).toFloat()
                animate().alpha(1f).translationY(0f).setDuration(160).setStartDelay((index * 22L).coerceAtMost(140L)).start()
            })
        }
        scroll.addView(list)
        content.addView(scroll, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    }

    private fun chatRow(conversation: Conversation): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(14), context.dp(14), context.dp(14), context.dp(14))
            background = rounded(ManwonColors.SURFACE, 14, ManwonColors.LINE, 1, context)
            setOnClickListener { openConversation(conversation.id) }
        }
        pressFeedback(row)

        val avatar = TextView(context).apply {
            text = (conversation.otherNickname ?: "상대").take(1)
            gravity = Gravity.CENTER
            styleText(17f, ManwonColors.BRAND, Typeface.BOLD)
            background = circle(ManwonColors.BRAND_SOFT, context = context)
        }
        row.addView(avatar, LinearLayout.LayoutParams(context.dp(48), context.dp(48)))

        val body = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(12), 0, 0, 0)
        }
        val top = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(label(context, conversation.otherNickname ?: "상대방", 16f, ManwonColors.TEXT, Typeface.BOLD), LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        top.addView(TextView(context).apply {
            text = statusText(conversation)
            styleText(12f, if (conversation.isClosed) ManwonColors.MUTED else ManwonColors.BRAND, Typeface.BOLD)
            setPadding(context.dp(8), context.dp(4), context.dp(8), context.dp(4))
            background = rounded(if (conversation.isClosed) 0xFFF1F1F3.toInt() else ManwonColors.BRAND_SOFT, 999, context = context)
        })
        top.addView(label(context, compactDateText(conversation.lastMessageAt), 12f, ManwonColors.MUTED), LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            leftMargin = context.dp(8)
        })
        body.addView(top)
        body.addView(TextView(context).apply {
            text = conversation.lastMessage ?: "새 채팅방이 생성되었어요."
            styleText(14f, ManwonColors.MUTED, Typeface.NORMAL, 1)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(6)
        })
        row.addView(body, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))

        val unread = conversation.unreadCount ?: 0
        if (unread > 0) {
            row.addView(TextView(context).apply {
                text = if (unread > 9) "9+" else "$unread"
                gravity = Gravity.CENTER
                styleText(12f, ManwonColors.SURFACE, Typeface.BOLD)
                background = rounded(ManwonColors.BRAND, 999, context = context)
            }, LinearLayout.LayoutParams(context.dp(30), context.dp(24)))
        }

        return FrameLayout(context).apply {
            setPadding(0, context.dp(4), 0, context.dp(4))
            addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        }
    }

    private fun showLoading(title: String) {
        content.removeAllViews()
        content.addView(sectionHeader(context, "채팅"))
        content.addView(centerMessage(context, title), LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    }

    private fun showError(message: String) {
        content.removeAllViews()
        content.addView(sectionHeader(context, "채팅"))
        content.addView(emptyView(context, "문제가 생겼어요", message, "다시 시도") { load() })
    }

    private fun totalUnreadCount(conversations: List<Conversation>): Int {
        var total = 0
        conversations.forEach { conversation ->
            total += maxOf(conversation.unreadCount ?: 0, 0)
            if (total > 99) return 100
        }
        return total
    }
}

class ChatDetailView(
    context: Context,
    private val api: APIClient,
    private val imagePickerHost: ImagePickerHost,
    private val conversationId: String,
    private val onBack: () -> Unit
) : LinearLayout(context) {
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var polling = false
    private var currentUserId: String? = null
    private var conversation: Conversation? = null
    private var messages: MutableList<Message> = mutableListOf()
    private val actionContainer = FrameLayout(context).apply {
        setBackgroundColor(ManwonColors.BACKGROUND)
    }
    private val messageList = LinearLayout(context).apply {
        orientation = VERTICAL
        setPadding(context.dp(14), context.dp(12), context.dp(14), context.dp(12))
    }
    private val scroll = ScrollView(context).apply {
        setBackgroundColor(ManwonColors.BACKGROUND)
        addView(messageList)
    }
    private val titleView = TextView(context)
    private val draft = EditText(context)

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!polling) return
            load(silent = true)
            handler.postDelayed(this, 5_000)
        }
    }

    init {
        orientation = VERTICAL
        setBackgroundColor(ManwonColors.SURFACE)
        val header = detailHeader()
        installKeyboardDismiss(header)
        installKeyboardDismiss(actionContainer)
        installKeyboardDismiss(scroll)
        addView(header)
        addView(actionContainer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(scroll, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        addView(composer())
        showLoading()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        polling = true
        load()
        handler.postDelayed(pollRunnable, 5_000)
    }

    override fun onDetachedFromWindow() {
        polling = false
        handler.removeCallbacks(pollRunnable)
        super.onDetachedFromWindow()
    }

    private fun load(silent: Boolean = false) {
        if (!silent) showLoading()
        runAsync({
            val session = api.fetchSession()
            val conversations = api.fetchConversations()
            val loadedMessages = api.fetchMessages(conversationId)
            api.markConversationRead(conversationId)
            Triple(session, conversations.firstOrNull { it.id == conversationId }, loadedMessages)
        }) { result ->
            result
                .onSuccess { output ->
                    currentUserId = output.first.userId
                    conversation = output.second
                    messages = output.third.toMutableList()
                    titleView.text = conversation?.otherNickname ?: "채팅"
                    renderMessages()
                }
                .onFailure { showError(it.message ?: "채팅방을 불러오지 못했습니다.") }
        }
    }

    private fun sendText() {
        val text = draft.text.toString().trim()
        if (text.isBlank() || conversation?.isClosed == true) return
        draft.setText("")
        val clientMessageId = UUID.randomUUID().toString()
        val pending = Message(
            id = "pending-$clientMessageId",
            conversationId = conversationId,
            senderId = currentUserId ?: "me",
            messageType = "text",
            body = text,
            imageUrl = null,
            clientMessageId = clientMessageId,
            deliveredAt = null,
            readAt = null,
            createdAt = java.time.Instant.now().toString()
        )
        messages.add(pending)
        renderMessages()
        runAsync({ api.sendTextMessage(conversationId, text, clientMessageId) }) { result ->
            result
                .onSuccess {
                    messages.removeAll { message -> message.clientMessageId == clientMessageId }
                    messages.add(it)
                    renderMessages()
                    load(silent = true)
                }
                .onFailure { showToastLike(it.message ?: "메시지를 보내지 못했습니다.") }
        }
    }

    private fun sendImage(data: ByteArray) {
        val clientMessageId = UUID.randomUUID().toString()
        runAsync({
            val upload = api.uploadImage(data, "chat-$clientMessageId.jpg", "image/jpeg", "chat-message")
            api.sendImageMessage(conversationId, upload.imageUrl, clientMessageId)
        }) { result ->
            result
                .onSuccess {
                    messages.add(it)
                    renderMessages()
                    load(silent = true)
                }
                .onFailure { showToastLike(it.message ?: "이미지를 보내지 못했습니다.") }
        }
    }

    private fun updateDealStatus(status: String) {
        val dealId = conversation?.dealId ?: return
        runAsync({ api.updateDealStatus(dealId, status) }) { result ->
            result.onSuccess { load() }.onFailure { showToastLike(it.message ?: "상태 변경에 실패했습니다.") }
        }
    }

    private fun updateApplicationStatus(status: String) {
        val applicationId = conversation?.applicationId ?: return
        runAsync({ api.updateApplicationStatus(applicationId, status) }) { result ->
            result.onSuccess { load() }.onFailure { showToastLike(it.message ?: "상태 변경에 실패했습니다.") }
        }
    }

    private fun confirmDealStatus(status: String) {
        showActionConfirmation(dealStatusConfirmation(status)) {
            updateDealStatus(status)
        }
    }

    private fun confirmApplicationStatus(status: String) {
        showActionConfirmation(applicationStatusConfirmation(status)) {
            updateApplicationStatus(status)
        }
    }

    private fun showActionConfirmation(confirmation: ChatActionConfirmation, action: () -> Unit) {
        hideKeyboard()
        AlertDialog.Builder(context)
            .setTitle(confirmation.title)
            .setMessage(confirmation.message)
            .setNegativeButton("돌아가기", null)
            .setPositiveButton(confirmation.confirmTitle) { _, _ -> action() }
            .show()
    }

    private fun dealStatusConfirmation(status: String): ChatActionConfirmation {
        return when (status) {
            "completed" -> ChatActionConfirmation(
                "완료 승인할까요?",
                "승인하면 거래가 완료되고 후기 작성 단계로 넘어갑니다.",
                "완료 승인"
            )
            "disputed" -> ChatActionConfirmation(
                "문제를 신고할까요?",
                "거래에 문제가 있으면 신고 상태로 전환됩니다.",
                "신고하기"
            )
            "complete_requested" -> ChatActionConfirmation(
                "완료 요청을 보낼까요?",
                "작업이 끝났다면 작성자에게 완료 승인을 요청합니다.",
                "요청 보내기"
            )
            "cancelled" -> ChatActionConfirmation(
                "거래를 취소할까요?",
                "취소 후에는 이 거래를 다시 진행할 수 없습니다.",
                "취소하기"
            )
            "in_progress" -> ChatActionConfirmation(
                "거래를 시작할까요?",
                "시작 후 지원자가 완료 요청을 보낼 수 있습니다.",
                "시작하기"
            )
            else -> ChatActionConfirmation(
                "상태를 변경할까요?",
                "이 작업은 거래 상태에 바로 반영됩니다.",
                "확인"
            )
        }
    }

    private fun applicationStatusConfirmation(status: String): ChatActionConfirmation {
        return when (status) {
            "accepted" -> ChatActionConfirmation(
                "지원자를 수락할까요?",
                "수락하면 거래가 만들어지고 채팅에서 진행을 시작할 수 있습니다.",
                "수락하기"
            )
            "rejected" -> ChatActionConfirmation(
                "지원을 거절할까요?",
                "거절 후에는 이 채팅에서 거래를 진행할 수 없습니다.",
                "거절하기"
            )
            else -> ChatActionConfirmation(
                "상태를 변경할까요?",
                "이 작업은 거래 상태에 바로 반영됩니다.",
                "확인"
            )
        }
    }

    private fun renderMessages() {
        messageList.removeAllViews()
        renderActionPanel()
        if (conversation == null) {
            messageList.addView(centerMessage(context, "채팅방을 찾지 못했어요"))
        } else {
            messages.forEach { message -> messageList.addView(messageBubble(message)) }
        }
        handler.post { scroll.fullScroll(FOCUS_DOWN) }
    }

    private fun renderActionPanel() {
        actionContainer.removeAllViews()
        val conversation = conversation ?: return
        actionContainer.addView(actionPanel(conversation), FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    private fun actionPanel(conversation: Conversation): View {
        val postCreatorId = conversation.postCreatorId ?: conversation.requesterId
        val isPostWriter = postCreatorId != null && postCreatorId == currentUserId
        val isApplicant = currentUserId != null && postCreatorId != null && currentUserId != postCreatorId
        val hasPendingApplication = conversation.applicationId != null && conversation.applicationStatus == "applied" && conversation.dealId == null
        val hasChatAfterStarted = conversation.hasChatAfterStarted == true
        val panel = LinearLayout(context).apply {
            orientation = VERTICAL
            setPadding(context.dp(14), context.dp(14), context.dp(14), context.dp(14))
            background = rounded(ManwonColors.SURFACE, 14, ManwonColors.LINE, 1, context)
        }
        panel.addView(TextView(context).apply {
            text = when (conversation.dealStatus) {
                "completed" -> "거래가 완료되었어요."
                "cancelled" -> "거래가 취소되었어요."
                "complete_requested" -> if (isPostWriter) "지원자가 완료 요청을 보냈어요." else "완료 요청을 보냈어요."
                "accepted" -> if (isPostWriter) "거래를 시작할 수 있어요." else "작성자의 진행 시작을 기다리고 있어요."
                "in_progress" -> if (isApplicant) "완료 요청을 보낼 수 있어요." else "진행 중인 거래입니다."
                else -> if (conversation.applicationId != null) "지원 요청이 도착했어요." else conversation.postTitle ?: "거래 대화"
            }
            styleText(15f, ManwonColors.TEXT, Typeface.BOLD)
        })
        if (hasPendingApplication && isPostWriter) {
            panel.addView(profilePromptRow(), LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(10)
            })
        }
        var helperText: String? = null
        val actions = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER
        }
        when {
            conversation.dealStatus == "complete_requested" && isPostWriter && hasChatAfterStarted -> {
                actions.addView(actionButton("완료 승인") { confirmDealStatus("completed") }, LinearLayout.LayoutParams(0, context.dp(44), 1f))
                actions.addView(actionButton("문제 신고", secondary = true) { confirmDealStatus("disputed") }, LinearLayout.LayoutParams(0, context.dp(44), 1f).apply { leftMargin = context.dp(8) })
            }
            conversation.dealStatus == "complete_requested" && isPostWriter -> {
                helperText = "진행 시작 후 양쪽 대화가 1턴 이상 있어야 승인할 수 있어요."
            }
            conversation.dealStatus == "complete_requested" -> {
                helperText = "게시글 작성자의 완료 승인을 기다리고 있어요."
            }
            conversation.dealStatus == "accepted" && isPostWriter -> {
                actions.addView(actionButton("진행 시작") { confirmDealStatus("in_progress") }, LinearLayout.LayoutParams(0, context.dp(44), 1f))
                actions.addView(actionButton("취소", secondary = true) { confirmDealStatus("cancelled") }, LinearLayout.LayoutParams(0, context.dp(44), 1f).apply { leftMargin = context.dp(8) })
            }
            conversation.dealStatus == "accepted" -> {
                helperText = "진행 시작 후 완료 요청을 보낼 수 있습니다."
            }
            conversation.dealStatus == "in_progress" && isApplicant -> {
                actions.addView(actionButton("완료 요청 보내기") { confirmDealStatus("complete_requested") }, LinearLayout.LayoutParams(0, context.dp(44), 1f))
                actions.addView(actionButton("취소", secondary = true) { confirmDealStatus("cancelled") }, LinearLayout.LayoutParams(0, context.dp(44), 1f).apply { leftMargin = context.dp(8) })
            }
            conversation.dealStatus == "in_progress" -> {
                helperText = "지원자가 완료 요청을 보내면 승인할 수 있습니다."
            }
            hasPendingApplication && isPostWriter -> {
                actions.addView(actionButton("수락하기") { confirmApplicationStatus("accepted") }, LinearLayout.LayoutParams(0, context.dp(44), 1f))
                actions.addView(actionButton("거절하기", secondary = true) { confirmApplicationStatus("rejected") }, LinearLayout.LayoutParams(0, context.dp(44), 1f).apply { leftMargin = context.dp(8) })
            }
            hasPendingApplication -> {
                helperText = "작성자가 수락하면 거래가 시작됩니다."
            }
        }
        helperText?.let { message ->
            panel.addView(TextView(context).apply {
                text = message
                styleText(13f, ManwonColors.MUTED, Typeface.BOLD)
            }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(8) })
        }
        if (actions.childCount > 0) {
            panel.addView(actions, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(12) })
        }
        return FrameLayout(context).apply {
            setPadding(0, 0, 0, context.dp(12))
            addView(panel)
        }
    }

    private fun profilePromptRow(): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(12), context.dp(10), context.dp(12), context.dp(10))
            background = rounded(ManwonColors.BRAND_SOFT, 12, context = context)
            setOnClickListener {
                hideKeyboard()
                showProfileSheet()
            }
            addView(TextView(context).apply {
                text = "수락 전에 지원자 프로필을 확인해보세요."
                styleText(12f, ManwonColors.MUTED, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply {
                text = "프로필 보기"
                styleText(12f, ManwonColors.BRAND, Typeface.BOLD)
            })
            pressFeedback(this)
        }
    }

    private fun showProfileSheet() {
        val current = conversation ?: return
        hideKeyboard()
        val dialog = Dialog(context)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        val root = FrameLayout(context).apply {
            setPadding(context.dp(10), context.dp(42), context.dp(10), 0)
        }
        val scroll = ScrollView(context).apply {
            isFillViewport = false
            addView(profileSheetContent(current) { dialog.dismiss() })
        }
        root.addView(scroll, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.BOTTOM))
        dialog.setContentView(root)
        dialog.setOnShowListener {
            val window = dialog.window ?: return@setOnShowListener
            window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            window.setGravity(Gravity.BOTTOM)
            window.setLayout(LayoutParams.MATCH_PARENT, (resources.displayMetrics.heightPixels * 0.9f).toInt())
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            window.setDimAmount(0.45f)
        }
        dialog.show()
    }

    private fun profileSheetContent(conversation: Conversation, onClose: () -> Unit): View {
        return LinearLayout(context).apply {
            orientation = VERTICAL
            setPadding(context.dp(20), context.dp(10), context.dp(20), context.dp(26))
            background = rounded(ManwonColors.SURFACE, 22, context = context)

            addView(FrameLayout(context).apply {
                addView(View(context).apply {
                    background = rounded(0xFFD8D8DE.toInt(), 999, context = context)
                }, FrameLayout.LayoutParams(context.dp(42), context.dp(4), Gravity.CENTER))
                val close = TextView(context).apply {
                    text = "×"
                    gravity = Gravity.CENTER
                    styleText(22f, ManwonColors.MUTED, Typeface.BOLD)
                    setOnClickListener { onClose() }
                }
                pressFeedback(close)
                addView(close, FrameLayout.LayoutParams(context.dp(42), context.dp(42), Gravity.END or Gravity.CENTER_VERTICAL))
            }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, context.dp(42)))

            addView(profileHeader(conversation), LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(2)
            })
            addView(profileMetrics(conversation), LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(18)
            })

            val details = LinearLayout(context).apply {
                orientation = VERTICAL
            }
            trimmed(conversation.otherCareerSummary)?.let { value ->
                details.addView(profileDetailTextSection("경력 한 줄", value), detailSectionParams())
            }
            trimmed(conversation.otherCareerDescription)?.let { value ->
                details.addView(profileDetailTextSection("상세 소개", value), detailSectionParams())
            }
            val links = conversation.otherPortfolioLinks.filter { !it.url.isNullOrBlank() }
            if (links.isNotEmpty()) {
                details.addView(profileDetailContainer("링크", profileLinksView(links)), detailSectionParams())
            }
            val images = conversation.otherWorkSampleImages.filter { !it.imageUrl.isNullOrBlank() }
            if (images.isNotEmpty()) {
                details.addView(profileDetailContainer("사진", profilePhotoGrid(images)), detailSectionParams())
            }
            trimmed(conversation.otherResponseTime)?.let { value ->
                details.addView(profileInfoRow("응답", value), detailSectionParams())
            }
            if (hasVerification(conversation)) {
                details.addView(profileBadges(conversation), detailSectionParams())
            }
            if (details.childCount > 0) {
                addView(details, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    topMargin = context.dp(18)
                })
            }
        }
    }

    private fun profileHeader(conversation: Conversation): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(profileAvatar(conversation), LinearLayout.LayoutParams(context.dp(64), context.dp(64)))
            addView(LinearLayout(context).apply {
                orientation = VERTICAL
                setPadding(context.dp(13), 0, 0, 0)

                addView(LinearLayout(context).apply {
                    orientation = HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    addView(TextView(context).apply {
                        text = conversation.otherNickname ?: "상대방"
                        styleText(22f, ManwonColors.TEXT, Typeface.BOLD, 1)
                    }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
                    genderText(conversation.otherGender)?.let { gender ->
                        addView(TextView(context).apply {
                            text = gender
                            styleText(12f, ManwonColors.MUTED, Typeface.BOLD)
                            setPadding(context.dp(8), context.dp(4), context.dp(8), context.dp(4))
                            background = rounded(0xFFF2F2F5.toInt(), 999, context = context)
                        }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                            leftMargin = context.dp(8)
                        })
                    }
                })

                addView(TextView(context).apply {
                    text = trimmed(conversation.otherBio) ?: "아직 소개가 없습니다."
                    styleText(14f, ManwonColors.MUTED, Typeface.NORMAL)
                }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    topMargin = context.dp(5)
                })
            }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        }
    }

    private fun profileAvatar(conversation: Conversation): View {
        val imageUrl = api.absoluteUrl(conversation.otherAvatarUrl)
        return FrameLayout(context).apply {
            background = circle(ManwonColors.BRAND_SOFT, context = context)
            clipToOutline = true
            if (imageUrl != null) {
                addView(ImageView(context).apply {
                    loadRemoteImage(imageUrl)
                }, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            } else {
                addView(TextView(context).apply {
                    text = (conversation.otherNickname ?: "만").take(1)
                    gravity = Gravity.CENTER
                    styleText(23f, ManwonColors.BRAND, Typeface.BOLD)
                }, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }
        }
    }

    private fun profileMetrics(conversation: Conversation): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            addView(profileMetric("평점", ratingText(conversation)), LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(profileMetric("거래 완료", "${conversation.otherCompletedCount ?: 0}회"), LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = context.dp(8)
            })
            addView(profileMetric("후기", "${conversation.otherReviewCount ?: 0}개"), LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = context.dp(8)
            })
        }
    }

    private fun profileMetric(title: String, value: String): View {
        return LinearLayout(context).apply {
            orientation = VERTICAL
            gravity = Gravity.CENTER
            setPadding(context.dp(6), context.dp(12), context.dp(6), context.dp(12))
            background = rounded(ManwonColors.SURFACE, 13, ManwonColors.LINE, 1, context)
            addView(TextView(context).apply {
                text = value
                gravity = Gravity.CENTER
                styleText(15f, ManwonColors.TEXT, Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = title
                gravity = Gravity.CENTER
                styleText(11f, ManwonColors.MUTED, Typeface.BOLD)
            }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(3)
            })
        }
    }

    private fun profileDetailTextSection(title: String, value: String): View {
        return profileDetailContainer(title, TextView(context).apply {
            text = value
            styleText(14f, ManwonColors.MUTED, Typeface.NORMAL)
        })
    }

    private fun profileDetailContainer(title: String, content: View): View {
        return LinearLayout(context).apply {
            orientation = VERTICAL
            setPadding(context.dp(14), context.dp(14), context.dp(14), context.dp(14))
            background = rounded(0xFFFAFAFB.toInt(), 14, context = context)
            addView(TextView(context).apply {
                text = title
                styleText(13f, ManwonColors.TEXT, Typeface.BOLD)
            })
            addView(content, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(8)
            })
        }
    }

    private fun profileLinksView(links: List<ProfileLink>): View {
        return LinearLayout(context).apply {
            orientation = VERTICAL
            links.forEachIndexed { index, link ->
                val url = link.url ?: return@forEachIndexed
                val row = LinearLayout(context).apply {
                    orientation = VERTICAL
                    setPadding(context.dp(12), context.dp(10), context.dp(12), context.dp(10))
                    background = rounded(0xFFF7F7F9.toInt(), 12, context = context)
                    setOnClickListener { openExternalUrl(url) }
                    addView(TextView(context).apply {
                        text = trimmed(link.title) ?: linkDisplayName(url)
                        styleText(13f, ManwonColors.TEXT, Typeface.BOLD)
                    })
                    addView(TextView(context).apply {
                        text = url
                        styleText(12f, ManwonColors.BRAND, Typeface.BOLD, 1)
                    }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                        topMargin = context.dp(3)
                    })
                }
                pressFeedback(row)
                addView(row, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    if (index > 0) topMargin = context.dp(8)
                })
            }
        }
    }

    private fun profilePhotoGrid(images: List<ProfileSampleImage>): View {
        return LinearLayout(context).apply {
            orientation = VERTICAL
            images.chunked(3).forEachIndexed { rowIndex, rowImages ->
                val row = LinearLayout(context).apply {
                    orientation = HORIZONTAL
                    rowImages.forEachIndexed { index, image ->
                        addView(ImageView(context).apply {
                            background = rounded(ManwonColors.BRAND_SOFT, 12, context = context)
                            clipToOutline = true
                            loadRemoteImage(api.absoluteUrl(image.imageUrl))
                        }, LinearLayout.LayoutParams(0, context.dp(92), 1f).apply {
                            if (index > 0) leftMargin = context.dp(8)
                        })
                    }
                    repeat(3 - rowImages.size) {
                        addView(View(context), LinearLayout.LayoutParams(0, context.dp(92), 1f).apply {
                            leftMargin = context.dp(8)
                        })
                    }
                }
                addView(row, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    if (rowIndex > 0) topMargin = context.dp(8)
                })
            }
        }
    }

    private fun profileInfoRow(title: String, value: String): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(13), context.dp(12), context.dp(13), context.dp(12))
            background = rounded(0xFFF7F7F9.toInt(), 13, context = context)
            addView(TextView(context).apply {
                text = title
                styleText(13f, ManwonColors.TEXT, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply {
                text = value
                styleText(13f, ManwonColors.MUTED, Typeface.BOLD)
            })
        }
    }

    private fun profileBadges(conversation: Conversation): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            if (conversation.otherPhoneVerified == true) addView(profileBadge("휴대폰 인증"))
            if (conversation.otherIdentityVerified == true) {
                addView(profileBadge("본인 인증"), LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    if (conversation.otherPhoneVerified == true) leftMargin = context.dp(8)
                })
            }
        }
    }

    private fun profileBadge(textValue: String): View {
        return TextView(context).apply {
            text = textValue
            styleText(12f, ManwonColors.BRAND, Typeface.BOLD)
            setPadding(context.dp(10), context.dp(7), context.dp(10), context.dp(7))
            background = rounded(ManwonColors.BRAND_SOFT, 999, context = context)
        }
    }

    private fun detailSectionParams(): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(12)
        }
    }

    private fun ratingText(conversation: Conversation): String {
        val rating = conversation.otherRatingAvg ?: 0.0
        return if (rating > 0.0) String.format(Locale.KOREA, "%.1f", rating) else "신규"
    }

    private fun genderText(value: String?): String? {
        return when (value) {
            "male" -> "남성"
            "female" -> "여성"
            else -> null
        }
    }

    private fun hasVerification(conversation: Conversation): Boolean {
        return conversation.otherPhoneVerified == true || conversation.otherIdentityVerified == true
    }

    private fun trimmed(value: String?): String? {
        val text = value?.trim().orEmpty()
        return text.ifBlank { null }
    }

    private fun linkDisplayName(url: String): String {
        return runCatching {
            Uri.parse(url).host?.removePrefix("www.") ?: url
        }.getOrDefault(url)
    }

    private fun openExternalUrl(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    private fun actionButton(textValue: String, secondary: Boolean = false, action: () -> Unit): TextView {
        return TextView(context).apply {
            text = textValue
            gravity = Gravity.CENTER
            styleText(15f, if (secondary) ManwonColors.BRAND else ManwonColors.SURFACE, Typeface.BOLD)
            background = rounded(if (secondary) ManwonColors.BRAND_SOFT else ManwonColors.BRAND, 14, context = context)
            setOnClickListener {
                hideKeyboard()
                action()
            }
            pressFeedback(this)
        }
    }

    private fun messageBubble(message: Message): View {
        val mine = message.senderId == currentUserId
        if (message.messageType == "system") {
            return TextView(context).apply {
                text = message.body.orEmpty()
                gravity = Gravity.CENTER
                styleText(12f, ManwonColors.MUTED, Typeface.BOLD)
                setPadding(context.dp(12), context.dp(7), context.dp(12), context.dp(7))
                background = rounded(0xFFF0F0F2.toInt(), 999, context = context)
            }.let { bubble ->
                FrameLayout(context).apply {
                    setPadding(context.dp(16), context.dp(4), context.dp(16), context.dp(4))
                    addView(bubble, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
                }
            }
        }

        val column = LinearLayout(context).apply {
            orientation = VERTICAL
            gravity = if (mine) Gravity.END else Gravity.START
        }

        if (message.messageType == "image") {
            column.addView(ImageView(context).apply {
                background = rounded(ManwonColors.BRAND_SOFT, 16, context = context)
                clipToOutline = true
                loadRemoteImage(api.absoluteUrl(message.imageUrl))
            }, LinearLayout.LayoutParams(context.dp(210), context.dp(210)))
        }

        if (!message.body.isNullOrBlank()) {
            column.addView(TextView(context).apply {
                text = message.body
                styleText(15f, if (mine) ManwonColors.SURFACE else ManwonColors.TEXT, Typeface.NORMAL)
                setPadding(context.dp(14), context.dp(10), context.dp(14), context.dp(10))
                background = rounded(if (mine) ManwonColors.BRAND else ManwonColors.SURFACE, 18, context = context)
            }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(4) })
        }
        column.addView(TextView(context).apply {
            text = compactDateText(message.createdAt)
            styleText(11f, ManwonColors.MUTED)
        }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(4) })

        return FrameLayout(context).apply {
            setPadding(context.dp(16), context.dp(4), context.dp(16), context.dp(4))
            addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, if (mine) Gravity.END else Gravity.START))
        }
    }

    private fun detailHeader(): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(8), context.dp(8), context.dp(12), context.dp(6))
            setBackgroundColor(ManwonColors.SURFACE)
            val back = TextView(context).apply {
                text = "‹"
                gravity = Gravity.CENTER
                styleText(30f, ManwonColors.TEXT, Typeface.NORMAL)
                setOnClickListener { onBack() }
            }
            pressFeedback(back)
            addView(back, LinearLayout.LayoutParams(context.dp(42), context.dp(42)))
            addView(titleView.apply {
                text = "채팅"
                styleText(17f, ManwonColors.TEXT, Typeface.BOLD)
                gravity = Gravity.CENTER_VERTICAL
            }, LinearLayout.LayoutParams(0, context.dp(42), 1f))
            val profile = ImageButton(context).apply {
                setImageResource(android.R.drawable.ic_menu_myplaces)
                background = rounded(Color.TRANSPARENT, 999, context = context)
                contentDescription = "상대방 프로필 보기"
                setColorFilter(ManwonColors.TEXT)
                setOnClickListener {
                    hideKeyboard()
                    showProfileSheet()
                }
            }
            pressFeedback(profile)
            addView(profile, LinearLayout.LayoutParams(context.dp(42), context.dp(42)))
        }
    }

    private fun composer(): View {
        return LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(12), context.dp(10), context.dp(12), context.dp(10))
            background = rounded(0xF8FFFFFF.toInt(), 0, ManwonColors.LINE, 1, context)

            val add = TextView(context).apply {
                text = "+"
                gravity = Gravity.CENTER
                styleText(25f, ManwonColors.BRAND, Typeface.BOLD)
                background = circle(ManwonColors.BRAND_SOFT, context = context)
                setOnClickListener {
                    if (conversation?.isClosed != true) {
                        imagePickerHost.pickImage { data -> if (data != null) sendImage(data) }
                    }
                }
            }
            pressFeedback(add)
            addView(add, LinearLayout.LayoutParams(context.dp(38), context.dp(38)))

            addView(draft.apply {
                hint = "메시지를 입력하세요"
                minLines = 1
                maxLines = 4
                textSize = 15f
                setTextColor(ManwonColors.TEXT)
                setHintTextColor(ManwonColors.MUTED)
                setPadding(context.dp(14), context.dp(8), context.dp(14), context.dp(8))
                background = rounded(0xFFF5F5F6.toInt(), 18, context = context)
                setOnFocusChangeListener { _, hasFocus ->
                    if (hasFocus) handler.postDelayed({ scroll.fullScroll(FOCUS_DOWN) }, 250)
                }
            }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = context.dp(9)
                rightMargin = context.dp(9)
            })

            val send = TextView(context).apply {
                text = "전송"
                gravity = Gravity.CENTER
                styleText(14f, ManwonColors.SURFACE, Typeface.BOLD)
                background = rounded(ManwonColors.BRAND, 999, context = context)
                setOnClickListener { sendText() }
            }
            pressFeedback(send)
            addView(send, LinearLayout.LayoutParams(context.dp(58), context.dp(38)))
        }
    }

    private fun showLoading() {
        actionContainer.removeAllViews()
        messageList.removeAllViews()
        messageList.addView(centerMessage(context, "채팅방을 불러오는 중입니다."))
    }

    private fun showError(message: String) {
        actionContainer.removeAllViews()
        messageList.removeAllViews()
        messageList.addView(emptyView(context, "문제가 생겼어요", message, "다시 시도") { load() })
    }

    private fun showToastLike(message: String) {
        android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
    }

    private fun installKeyboardDismiss(view: View) {
        view.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN) hideKeyboard()
            false
        }
    }

    private fun hideKeyboard() {
        if (!draft.hasFocus()) return
        draft.clearFocus()
        context.getSystemService(InputMethodManager::class.java)
            ?.hideSoftInputFromWindow(draft.windowToken, 0)
    }
}

fun sectionHeader(context: Context, title: String): View {
    return TextView(context).apply {
        text = title
        gravity = Gravity.BOTTOM or Gravity.START
        styleText(27f, ManwonColors.TEXT, Typeface.BOLD)
        setPadding(context.dp(20), context.dp(22), context.dp(20), context.dp(12))
        setBackgroundColor(ManwonColors.SURFACE)
    }
}

fun centerMessage(context: Context, message: String): View {
    return LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(context.dp(28), context.dp(28), context.dp(28), context.dp(28))
        addView(TextView(context).apply {
            text = message
            gravity = Gravity.CENTER
            styleText(15f, ManwonColors.MUTED, Typeface.BOLD)
        })
    }
}

fun emptyView(
    context: Context,
    title: String,
    body: String? = null,
    actionTitle: String? = null,
    action: (() -> Unit)? = null
): View {
    return LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(context.dp(28), context.dp(28), context.dp(28), context.dp(28))
        setBackgroundColor(ManwonColors.SURFACE)

        addView(TextView(context).apply {
            text = "▱"
            gravity = Gravity.CENTER
            styleText(34f, ManwonColors.BRAND, Typeface.BOLD)
        })
        addView(TextView(context).apply {
            text = title
            gravity = Gravity.CENTER
            styleText(19f, ManwonColors.TEXT, Typeface.BOLD)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(8)
        })
        if (!body.isNullOrBlank()) {
            addView(TextView(context).apply {
                text = body
                gravity = Gravity.CENTER
                styleText(14f, ManwonColors.MUTED, Typeface.BOLD)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(8)
            })
        }
        if (actionTitle != null && action != null) {
            val button = TextView(context).apply {
                text = actionTitle
                gravity = Gravity.CENTER
                styleText(15f, ManwonColors.SURFACE, Typeface.BOLD)
                background = rounded(ManwonColors.BRAND, 14, context = context)
                setOnClickListener { action() }
            }
            pressFeedback(button)
            addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, context.dp(48)).apply {
                topMargin = context.dp(18)
            })
        }
    }
}
