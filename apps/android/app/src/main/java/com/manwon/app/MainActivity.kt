package com.manwon.app

import android.animation.ValueAnimator
import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.Window
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity(), ImagePickerHost, NearbyHost {
    private val api by lazy { APIClient(this) }
    private lateinit var root: FrameLayout
    private lateinit var contentRoot: FrameLayout
    private lateinit var bottomNav: LinearLayout
    private lateinit var homeWeb: WebTabView
    private lateinit var registerWeb: WebTabView
    private lateinit var activityWeb: WebTabView
    private lateinit var myWeb: WebTabView
    private lateinit var chatFrame: FrameLayout
    private lateinit var writeButton: TextView
    private val tabViews = mutableMapOf<AppTab, View>()
    private val navButtons = mutableMapOf<AppTab, LinearLayout>()
    private val displayedWebPaths = mutableMapOf(
        AppTab.HOME to "/",
        AppTab.REGISTER to "/register",
        AppTab.NEARBY to "/activity",
        AppTab.MY to "/my"
    )
    private var selectedTab = AppTab.HOME
    private var homePath = "/"
    private var registerPath = "/register"
    private var activityPath = "/activity"
    private var myPath = "/my"
    private var chatDetailActive = false
    private var nearbySheetCoversBottomNav = false
    private var keyboardVisible = false
    private var homeIsAtTop = true
    private var onboardingRequired = false
    private var chatUnreadCount = 0
    private var writeButtonExpanded: Boolean? = null
    private var writeButtonWidthAnimator: ValueAnimator? = null
    private var mapUnavailableDialog: AlertDialog? = null
    private var imagePickCallback: ((ByteArray?) -> Unit)? = null
    private var locationCallback: ((Double, Double, Boolean) -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.statusBarColor = ManwonColors.SURFACE
        window.navigationBarColor = ManwonColors.SURFACE

        root = FrameLayout(this)
        contentRoot = FrameLayout(this)
        root.addView(contentRoot, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        buildContentTabs()
        bottomNav = buildBottomNav()
        root.addView(bottomNav, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        writeButton = buildFloatingWriteButton()
        root.addView(writeButton, writeButtonLayoutParams(expanded = true))
        setContentView(root)
        watchKeyboard()
        showChatList()
        selectTab(AppTab.HOME)
        homeWeb.loadPath(homePath)
        registerWeb.loadPath(registerPath)
        activityWeb.loadPath(activityPath)
        myWeb.loadPath(myPath)
        refreshSessionGate()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onBackPressed() {
        if (selectedTab == AppTab.CHAT && chatDetailActive) {
            showChatList()
            return
        }
        val currentWeb = when (selectedTab) {
            AppTab.HOME -> homeWeb
            AppTab.REGISTER -> registerWeb
            AppTab.NEARBY -> activityWeb
            AppTab.MY -> myWeb
            else -> null
        }
        if (currentWeb?.canGoBack() == true) {
            currentWeb.goBack()
            return
        }
        if (selectedTab != AppTab.HOME) {
            selectTab(AppTab.HOME)
            return
        }
        super.onBackPressed()
    }

    private fun buildContentTabs() {
        homeWeb = WebTabView(
            this,
            "뭐든해줌",
            onNativeRoute = ::openNativeRoute,
            onLocationRequest = ::requestCurrentLocation,
            onProfileOnboardingCompleted = ::completeProfileOnboarding,
            onRouteChange = { path -> webRouteDidChange(path, AppTab.HOME) },
            onScrollTopChange = { isAtTop ->
                if (homeIsAtTop != isAtTop) {
                    homeIsAtTop = isAtTop
                    updateFloatingWriteButton()
                }
            },
            onFinished = { PushBridge.submitPendingToken(this, api) }
        )
        registerWeb = WebTabView(
            this,
            "등록",
            onNativeRoute = ::openNativeRoute,
            onLocationRequest = ::requestCurrentLocation,
            onProfileOnboardingCompleted = ::completeProfileOnboarding,
            onRouteChange = { path -> webRouteDidChange(path, AppTab.REGISTER) },
            onFinished = { PushBridge.submitPendingToken(this, api) }
        )
        myWeb = WebTabView(
            this,
            "마이",
            onNativeRoute = ::openNativeRoute,
            onLocationRequest = ::requestCurrentLocation,
            onProfileOnboardingCompleted = ::completeProfileOnboarding,
            onRouteChange = { path -> webRouteDidChange(path, AppTab.MY) },
            onFinished = { PushBridge.submitPendingToken(this, api) }
        )
        activityWeb = WebTabView(
            this,
            "내 활동",
            onNativeRoute = ::openNativeRoute,
            onLocationRequest = ::requestCurrentLocation,
            onProfileOnboardingCompleted = ::completeProfileOnboarding,
            onRouteChange = { path -> webRouteDidChange(path, AppTab.NEARBY) },
            onFinished = { PushBridge.submitPendingToken(this, api) }
        )
        chatFrame = FrameLayout(this)
        tabViews[AppTab.HOME] = homeWeb
        tabViews[AppTab.CHAT] = chatFrame
        tabViews[AppTab.REGISTER] = registerWeb
        tabViews[AppTab.NEARBY] = activityWeb
        tabViews[AppTab.MY] = myWeb
        tabViews.forEach { (_, view) ->
            view.visibility = View.GONE
            contentRoot.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
    }

    private fun buildBottomNav(): LinearLayout {
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            elevation = dp(12).toFloat()
        }
        nav.addView(View(this).apply { setBackgroundColor(ManwonColors.LINE) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)))
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.TOP
            setPadding(dp(10), dp(8), dp(10), dp(10))
        }
        listOf(
            NavItem(AppTab.HOME, "홈"),
            NavItem(AppTab.CHAT, "채팅"),
            NavItem(AppTab.NEARBY, "내 활동"),
            NavItem(AppTab.MY, "마이")
        ).forEach { item ->
            val button = navButton(item)
            navButtons[item.tab] = button
            row.addView(button, LinearLayout.LayoutParams(0, dp(88), 1f))
        }
        nav.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(108)))
        return nav
    }

    private fun navButton(item: NavItem): LinearLayout {
        val button = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            setOnClickListener {
                when (item.tab) {
                    AppTab.CHAT -> {
                        showChatList()
                        selectTab(AppTab.CHAT)
                    }
                    AppTab.NEARBY -> openWebPath("/activity")
                    AppTab.MY -> openWebPath("/my")
                    AppTab.HOME -> openWebPath("/")
                    AppTab.REGISTER -> openWebPath("/register")
                }
            }
        }
        pressFeedback(button)
        val iconFrame = FrameLayout(this)
        val icon: View = NavIconView(this, item.tab).apply {
            tag = "iconView"
        }
        iconFrame.addView(icon, FrameLayout.LayoutParams(dp(38), dp(38), Gravity.CENTER))
        if (item.tab == AppTab.CHAT) {
            iconFrame.addView(TextView(this).apply {
                tag = "unreadBadge"
                gravity = Gravity.CENTER
                includeFontPadding = false
                minWidth = dp(16)
                setPadding(dp(4), 0, dp(4), 0)
                styleText(10f, ManwonColors.BRAND, Typeface.BOLD)
                visibility = View.GONE
            }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(16), Gravity.TOP or Gravity.RIGHT).apply {
                topMargin = dp(2)
                rightMargin = dp(-7)
            })
        }
        button.addView(iconFrame, LinearLayout.LayoutParams(dp(38), dp(38)))
        val title = TextView(this).apply {
            text = item.title
            gravity = Gravity.CENTER
            tag = "title"
            styleText(11f, ManwonColors.TEXT, Typeface.BOLD)
        }
        button.addView(title, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        return button
    }

    private fun buildFloatingWriteButton(): TextView {
        return TextView(this).apply {
            text = "+ 글쓰기"
            gravity = Gravity.CENTER
            styleText(16f, ManwonColors.SURFACE, Typeface.BOLD)
            background = rounded(ManwonColors.BRAND, 27, context = this@MainActivity)
            elevation = dp(12).toFloat()
            alpha = 0f
            scaleX = 0.88f
            scaleY = 0.88f
            visibility = View.GONE
            setOnClickListener { openWebPath("/register") }
        }.also(::pressFeedback)
    }

    private fun writeButtonLayoutParams(expanded: Boolean): FrameLayout.LayoutParams {
        return FrameLayout.LayoutParams(if (expanded) dp(118) else dp(54), dp(54), Gravity.BOTTOM or Gravity.END).apply {
            marginEnd = dp(20)
            bottomMargin = (bottomNav.height.takeIf { it > 0 } ?: dp(109)) + dp(12)
        }
    }

    private fun updateFloatingWriteButton() {
        if (!::writeButton.isInitialized) return
        val visible = selectedTab == AppTab.HOME && !hidesBottomNav()
        val expanded = homeIsAtTop

        writeButton.animate().cancel()
        if (!visible) {
            writeButton.animate()
                .alpha(0f)
                .scaleX(0.88f)
                .scaleY(0.88f)
                .setDuration(140)
                .withEndAction { if (selectedTab != AppTab.HOME || hidesBottomNav()) writeButton.visibility = View.GONE }
                .start()
            return
        }

        if (writeButton.visibility != View.VISIBLE) {
            writeButton.visibility = View.VISIBLE
            writeButton.alpha = 0f
            writeButton.scaleX = 0.88f
            writeButton.scaleY = 0.88f
        }

        val layoutParams = writeButton.layoutParams as FrameLayout.LayoutParams
        layoutParams.bottomMargin = (bottomNav.height.takeIf { it > 0 } ?: dp(109)) + dp(12)
        writeButton.layoutParams = layoutParams
        animateWriteButtonSize(expanded)
        writeButton.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(180)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction(null)
            .start()
    }

    private fun animateWriteButtonSize(expanded: Boolean) {
        if (writeButtonExpanded == expanded) return
        writeButtonExpanded = expanded
        writeButton.text = if (expanded) "+ 글쓰기" else "+"

        val targetWidth = if (expanded) dp(118) else dp(54)
        val currentWidth = writeButton.width.takeIf { it > 0 } ?: (writeButton.layoutParams?.width ?: targetWidth)
        writeButtonWidthAnimator?.cancel()
        writeButtonWidthAnimator = ValueAnimator.ofInt(currentWidth, targetWidth).apply {
            duration = 220
            interpolator = DecelerateInterpolator()
            addUpdateListener { animator ->
                val params = writeButton.layoutParams as FrameLayout.LayoutParams
                params.width = animator.animatedValue as Int
                writeButton.layoutParams = params
            }
            start()
        }
    }

    private fun refreshBottomNavSelection() {
        navButtons.forEach { (tab, button) ->
            val active = tab == selectedTab
            val iconView = button.findViewWithTag<NavIconView>("iconView")
            val title = button.findViewWithTag<TextView>("title")
            val badge = button.findViewWithTag<TextView>("unreadBadge")
            iconView?.setActive(active)
            title?.setTextColor(if (active) ManwonColors.BRAND else ManwonColors.TEXT)
            updateUnreadBadge(badge, active)
            button.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
        }
    }

    private fun updateUnreadBadge(badge: TextView?, active: Boolean) {
        if (badge == null) return
        if (chatUnreadCount <= 0) {
            badge.visibility = View.GONE
            return
        }
        badge.text = if (chatUnreadCount > 99) "99+" else "$chatUnreadCount"
        badge.setTextColor(if (active) ManwonColors.TEXT else ManwonColors.BRAND)
        badge.background = null
        badge.visibility = View.VISIBLE
    }

    private fun setChatUnreadCount(count: Int) {
        chatUnreadCount = count.coerceAtLeast(0).coerceAtMost(100)
        refreshBottomNavSelection()
    }

    override fun selectTab(tab: AppTab) {
        selectedTab = tab
        updateSystemBars(tab)
        tabViews.forEach { (key, view) ->
            if (key == tab) {
                view.visibility = View.VISIBLE
                view.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).start()
            } else {
                view.animate().alpha(0f).scaleX(0.992f).scaleY(0.992f).setDuration(120).withEndAction {
                    if (selectedTab != key) view.visibility = View.GONE
                }.start()
            }
        }
        refreshBottomNavSelection()
        updateBottomNavVisibility()
    }

    private fun openNativeRoute(path: String) {
        val normalized = path.ifBlank { "/" }
        if (shouldBlockForOnboarding(normalized)) {
            routeToProfileOnboarding()
            return
        }

        when {
            normalized == "/chat" -> {
                showChatList()
                selectTab(AppTab.CHAT)
            }
            normalized.startsWith("/chat/") -> {
                showChatDetail(normalized.removePrefix("/chat/").substringBefore("?"))
                selectTab(AppTab.CHAT)
            }
            normalized == "/nearby" || normalized.startsWith("/nearby/") -> openWebPath("/activity")
            else -> openWebPath(normalized)
        }
    }

    private fun showMapUnavailableDialog() {
        if (mapUnavailableDialog?.isShowing == true) return

        mapUnavailableDialog = AlertDialog.Builder(this)
            .setMessage("지도 기능은 현재 준비중입니다.")
            .setPositiveButton("확인", null)
            .create()
            .also { dialog ->
                dialog.setOnDismissListener { mapUnavailableDialog = null }
                dialog.show()
            }
    }

    override fun openWebPath(path: String) {
        val normalized = path.ifBlank { "/" }
        if (shouldBlockForOnboarding(normalized)) {
            routeToProfileOnboarding()
            return
        }

        when {
            normalized == "/register" || normalized.startsWith("/register/") -> {
                registerPath = normalized
                registerWeb.loadPath(registerPath)
                selectTab(AppTab.REGISTER)
            }
            normalized == "/activity" || normalized.startsWith("/activity/") -> {
                activityPath = normalized
                activityWeb.loadPath(activityPath)
                selectTab(AppTab.NEARBY)
            }
            normalized == "/my" || normalized.startsWith("/my/") -> {
                myPath = normalized
                myWeb.loadPath(myPath)
                selectTab(AppTab.MY)
            }
            else -> {
                homePath = normalized
                homeWeb.loadPath(homePath)
                selectTab(AppTab.HOME)
            }
        }
    }

    private fun webRouteDidChange(path: String, tab: AppTab) {
        val normalized = path.ifBlank { "/" }
        if (onboardingRequired) {
            routeToProfileOnboarding()
            return
        }

        if (normalized == "/activity" || normalized.startsWith("/activity/")) {
            activityPath = normalized
            displayedWebPaths[AppTab.NEARBY] = normalized
            if (tab != AppTab.NEARBY) {
                activityWeb.loadPath(activityPath)
                selectTab(AppTab.NEARBY)
            }
            updateBottomNavVisibility()
            return
        }

        if (normalized == "/my" || normalized.startsWith("/my/")) {
            myPath = normalized
            displayedWebPaths[AppTab.MY] = normalized
            if (tab != AppTab.MY) {
                myWeb.loadPath(myPath)
                selectTab(AppTab.MY)
            }
            updateBottomNavVisibility()
            return
        }

        displayedWebPaths[tab] = normalized
        when (tab) {
            AppTab.HOME -> homePath = normalized
            AppTab.REGISTER -> registerPath = normalized
            AppTab.NEARBY -> activityPath = normalized
            AppTab.MY -> myPath = normalized
            AppTab.CHAT -> Unit
        }
        updateBottomNavVisibility()
    }

    private fun showChatList() {
        chatDetailActive = false
        chatFrame.removeAllViews()
        chatFrame.addView(ChatListView(this, api, openConversation = { id ->
            showChatDetail(id)
        }, openHome = {
            selectTab(AppTab.HOME)
        }, onUnreadCountChanged = { count ->
            setChatUnreadCount(count)
        }), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        updateBottomNavVisibility()
    }

    private fun showChatDetail(conversationId: String) {
        chatDetailActive = true
        chatFrame.removeAllViews()
        chatFrame.addView(ChatDetailView(this, api, this, conversationId) {
            showChatList()
        }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        updateBottomNavVisibility()
    }

    private fun hidesBottomNav(): Boolean {
        if (onboardingRequired) return true
        if (keyboardVisible) return true
        if (selectedTab == AppTab.CHAT && chatDetailActive) return true
        if (selectedTab == AppTab.NEARBY && nearbySheetCoversBottomNav) return true
        val path = displayedWebPaths[selectedTab] ?: return false
        return path == "/login"
            || path.startsWith("/login?")
            || path == "/signup"
            || path.startsWith("/signup?")
            || path == "/profile-onboarding"
            || path.startsWith("/posts/")
            || path == "/register/request"
            || path == "/register/offer"
    }

    private fun refreshSessionGate() {
        runAsync({ api.fetchSession() }) { result ->
            result.onSuccess { session ->
                onboardingRequired = session.authenticated && session.profile?.profileOnboardingCompleted != true
                if (onboardingRequired) routeToProfileOnboarding() else updateBottomNavVisibility()
            }
        }
    }

    private fun shouldBlockForOnboarding(path: String): Boolean {
        return onboardingRequired && path != "/profile-onboarding"
    }

    private fun routeToProfileOnboarding() {
        chatDetailActive = false
        homePath = "/profile-onboarding"
        displayedWebPaths[AppTab.HOME] = "/profile-onboarding"
        homeWeb.loadPath(homePath)
        selectTab(AppTab.HOME)
    }

    private fun completeProfileOnboarding() {
        onboardingRequired = false
        updateBottomNavVisibility()
    }

    private fun updateBottomNavVisibility() {
        val hidden = hidesBottomNav()
        val distance = bottomNav.height.takeIf { it > 0 } ?: dp(120)
        bottomNav.animate()
            .translationY(if (hidden) distance.toFloat() else 0f)
            .alpha(if (hidden) 0f else 1f)
            .setDuration(180)
            .withStartAction { if (!hidden) bottomNav.visibility = View.VISIBLE }
            .withEndAction { if (hidden) bottomNav.visibility = View.GONE }
            .start()
        updateFloatingWriteButton()
    }

    private fun updateSystemBars(tab: AppTab) {
        window.statusBarColor = ManwonColors.SURFACE
        window.navigationBarColor = ManwonColors.SURFACE
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }

    private fun watchKeyboard() {
        root.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                val visible = android.graphics.Rect()
                root.getWindowVisibleDisplayFrame(visible)
                val heightDiff = root.rootView.height - visible.height()
                val nextKeyboardVisible = heightDiff > root.rootView.height * 0.18
                if (keyboardVisible != nextKeyboardVisible) {
                    keyboardVisible = nextKeyboardVisible
                    updateBottomNavVisibility()
                }
            }
        })
    }

    override fun pickImage(onPicked: (ByteArray?) -> Unit) {
        imagePickCallback = onPicked
        val intent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).apply {
            type = "image/*"
        }
        startActivityForResult(intent, REQUEST_PICK_IMAGE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_PICK_IMAGE) {
            val callback = imagePickCallback
            imagePickCallback = null
            if (resultCode != RESULT_OK || data?.data == null) {
                callback?.invoke(null)
                return
            }
            val bytes = contentResolver.openInputStream(data.data!!)?.use { it.readBytes() }
            callback?.invoke(bytes)
        }
    }

    override fun requestCurrentLocation(onLocation: (latitude: Double, longitude: Double, denied: Boolean) -> Unit) {
        locationCallback = onLocation
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQUEST_LOCATION)
            return
        }
        deliverLocation(denied = false)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_LOCATION) {
            val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            deliverLocation(denied = !granted)
        }
    }

    private fun deliverLocation(denied: Boolean) {
        val callback = locationCallback ?: return
        val fallbackLat = 37.5009
        val fallbackLng = 127.0365
        if (denied) {
            callback(fallbackLat, fallbackLng, true)
            return
        }
        val location = lastKnownLocation()
        callback(location?.latitude ?: fallbackLat, location?.longitude ?: fallbackLng, false)
    }

    private fun lastKnownLocation(): Location? {
        return runCatching {
            val manager = getSystemService(LOCATION_SERVICE) as LocationManager
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            ) {
                return null
            }
            manager.getProviders(true).mapNotNull { provider -> manager.getLastKnownLocation(provider) }.maxByOrNull { it.time }
        }.getOrNull()
    }

    override fun setNearbySheetCoversBottomNav(covers: Boolean) {
        nearbySheetCoversBottomNav = covers
        updateBottomNavVisibility()
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data
        if (data != null) {
            val path = when {
                data.scheme == "manwon" && !data.host.isNullOrBlank() -> "/${data.host}${data.encodedPath.orEmpty()}"
                else -> AppConfig.pathWithQuery(data)
            }
            openNativeRoute(path)
            return
        }
        intent?.extras?.getString("conversationId")?.takeIf { it.isNotBlank() }?.let {
            openNativeRoute("/chat/$it")
            return
        }
        intent?.extras?.getString("postId")?.takeIf { it.isNotBlank() }?.let {
            openWebPath("/posts/$it")
        }
    }

    private data class NavItem(val tab: AppTab, val title: String)

    companion object {
        private const val REQUEST_PICK_IMAGE = 4101
        private const val REQUEST_LOCATION = 4102
    }
}

object PushBridge {
    private var pendingFcmToken: String? = null

    fun setPendingFcmToken(token: String?) {
        pendingFcmToken = token
    }

    fun submitPendingToken(activity: Activity, api: APIClient) {
        val token = pendingFcmToken ?: return
        runAsync({
            api.registerPushToken(
                platform = "android",
                fcmToken = token,
                deviceId = android.provider.Settings.Secure.getString(activity.contentResolver, android.provider.Settings.Secure.ANDROID_ID),
                appVersion = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName
            )
        }) { result ->
            if (result.isSuccess) pendingFcmToken = null
        }
    }
}

private class NavIconView(
    context: android.content.Context,
    private val tab: AppTab
) : View(context) {
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = context.dp(3).toFloat()
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val path = Path()
    private val rect = RectF()
    private var active = false

    fun setActive(value: Boolean) {
        active = value
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val color = if (active) ManwonColors.BRAND else ManwonColors.TEXT
        strokePaint.color = color
        fillPaint.color = color
        when (tab) {
            AppTab.HOME -> drawHome(canvas)
            AppTab.CHAT -> drawChat(canvas)
            AppTab.NEARBY -> drawActivity(canvas)
            AppTab.MY -> drawPerson(canvas)
            AppTab.REGISTER -> Unit
        }
    }

    private fun drawHome(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        path.reset()
        path.moveTo(w * 0.16f, h * 0.48f)
        path.lineTo(w * 0.50f, h * 0.18f)
        path.lineTo(w * 0.84f, h * 0.48f)
        canvas.drawPath(path, strokePaint)
        rect.set(w * 0.27f, h * 0.45f, w * 0.73f, h * 0.84f)
        canvas.drawRoundRect(rect, context.dp(2).toFloat(), context.dp(2).toFloat(), strokePaint)
        rect.set(w * 0.45f, h * 0.64f, w * 0.57f, h * 0.84f)
        canvas.drawRect(rect, fillPaint)
    }

    private fun drawChat(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        rect.set(w * 0.15f, h * 0.22f, w * 0.84f, h * 0.70f)
        canvas.drawRoundRect(rect, h * 0.18f, h * 0.18f, fillPaint)
        path.reset()
        path.moveTo(w * 0.34f, h * 0.66f)
        path.lineTo(w * 0.22f, h * 0.84f)
        path.lineTo(w * 0.48f, h * 0.70f)
        canvas.drawPath(path, fillPaint)
    }

    private fun drawMap(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val top = h * 0.22f
        val bottom = h * 0.82f
        path.reset()
        path.moveTo(w * 0.14f, top)
        path.lineTo(w * 0.36f, h * 0.34f)
        path.lineTo(w * 0.36f, bottom)
        path.lineTo(w * 0.14f, h * 0.70f)
        path.close()
        canvas.drawPath(path, fillPaint)
        path.reset()
        path.moveTo(w * 0.40f, h * 0.32f)
        path.lineTo(w * 0.60f, top)
        path.lineTo(w * 0.60f, h * 0.70f)
        path.lineTo(w * 0.40f, bottom)
        path.close()
        canvas.drawPath(path, fillPaint)
        path.reset()
        path.moveTo(w * 0.64f, top)
        path.lineTo(w * 0.86f, h * 0.32f)
        path.lineTo(w * 0.86f, bottom)
        path.lineTo(w * 0.64f, h * 0.70f)
        path.close()
        canvas.drawPath(path, fillPaint)
    }

    private fun drawActivity(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val rows = floatArrayOf(0.30f, 0.50f, 0.70f)
        rows.forEach { yRatio ->
            val y = h * yRatio
            canvas.drawCircle(w * 0.24f, y, w * 0.045f, fillPaint)
            canvas.drawLine(w * 0.36f, y, w * 0.78f, y, strokePaint)
        }
        rect.set(w * 0.14f, h * 0.18f, w * 0.86f, h * 0.82f)
        canvas.drawRoundRect(rect, w * 0.10f, w * 0.10f, strokePaint)
    }

    private fun drawPerson(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawCircle(w * 0.50f, h * 0.30f, w * 0.17f, fillPaint)
        rect.set(w * 0.22f, h * 0.52f, w * 0.78f, h * 0.86f)
        canvas.drawRoundRect(rect, w * 0.20f, w * 0.20f, fillPaint)
    }
}
