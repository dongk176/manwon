package com.manwon.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

interface NearbyHost {
    fun requestCurrentLocation(onLocation: (latitude: Double, longitude: Double, denied: Boolean) -> Unit)
    fun openWebPath(path: String)
    fun setNearbySheetCoversBottomNav(covers: Boolean)
    fun selectTab(tab: AppTab)
}

private enum class SheetDetent {
    COLLAPSED,
    MEDIUM,
    EXPANDED
}

private object NearbyPalette {
    const val MAP_CONTROL = 0xF5FFFFFF.toInt()
    const val MAP_BACKGROUND = 0xFFF4F5F7.toInt()
    const val MAP_GRID = 0xFFE3E6EA.toInt()
    const val MAP_ROAD = 0xFFD5DCE3.toInt()
    const val SELECTED_CARD = 0xFFFFF0EB.toInt()
    const val SELECTED_STROKE = 0x66FF4800
}

private fun topRoundedPanelBackground(context: Context): GradientDrawable {
    val radius = context.dp(26).toFloat()
    return GradientDrawable().apply {
        setColor(ManwonColors.NEARBY_PANEL)
        cornerRadii = floatArrayOf(
            radius, radius,
            radius, radius,
            0f, 0f,
            0f, 0f
        )
    }
}

class NearbyView(
    context: Context,
    private val api: APIClient,
    private val host: NearbyHost
) : FrameLayout(context) {
    private val map = NativeMapView(context)
    private val writeButton = TextView(context)
    private val sheet = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, context.dp(10), 0, 0)
        background = topRoundedPanelBackground(context)
    }
    private val sheetBody = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
    }
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var posts: List<TaskPost> = emptyList()
    private var selectedPostId: String? = null
    private var latitude = 37.5009
    private var longitude = 127.0365
    private var locationDenied = false
    private var detent = SheetDetent.MEDIUM
    private var dragStartY = 0f
    private var dragStartHeight = 0
    private var hasLoaded = false

    init {
        setBackgroundColor(ManwonColors.BACKGROUND)
        addView(map, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(writeButton, LayoutParams(LayoutParams.WRAP_CONTENT, context.dp(58), Gravity.BOTTOM or Gravity.END).apply {
            rightMargin = context.dp(22)
        })
        addView(sheet, LayoutParams(LayoutParams.MATCH_PARENT, context.dp(430), Gravity.BOTTOM))
        buildWriteButton()
        buildSheetShell()
        map.onSelectPost = { post ->
            selectedPostId = post.id
            setDetent(SheetDetent.COLLAPSED)
            renderSheetBody()
        }
    }

    fun activate() {
        host.setNearbySheetCoversBottomNav(detent != SheetDetent.COLLAPSED)
        if (hasLoaded) return
        hasLoaded = true
        reloadNearby()
    }

    override fun onDetachedFromWindow() {
        host.setNearbySheetCoversBottomNav(false)
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        handler.post { applySheetHeight(detentHeight(detent), animate = false) }
    }

    private fun reloadNearby() {
        host.requestCurrentLocation { lat, lng, denied ->
            latitude = lat
            longitude = lng
            locationDenied = denied
            map.setCenter(lat, lng)
            renderSheetLoading()
            runAsync({ api.fetchNearbyPosts(lat, lng) }) { result ->
                result
                    .onSuccess { loaded ->
                        posts = loaded
                        selectedPostId = selectedPostId?.takeIf { id -> loaded.any { it.id == id } } ?: loaded.firstOrNull()?.id
                        map.setPosts(loaded)
                        renderSheetBody()
                    }
                    .onFailure { renderSheetError(it.message ?: "주변 부탁을 불러오지 못했습니다.") }
            }
        }
    }

    private fun buildWriteButton() {
        writeButton.text = "+ 글쓰기"
        writeButton.gravity = Gravity.CENTER
        writeButton.styleText(18f, Color.WHITE, Typeface.BOLD)
        writeButton.setPadding(context.dp(20), 0, context.dp(20), 0)
        writeButton.background = rounded(ManwonColors.BRAND, 999, context = context)
        writeButton.setOnClickListener { host.openWebPath("/register") }
        pressFeedback(writeButton)
    }

    private fun buildSheetShell() {
        val grabber = View(context).apply {
            background = rounded(ManwonColors.LINE, 999, context = context)
        }
        val grabberFrame = FrameLayout(context).apply {
            setPadding(0, 0, 0, context.dp(12))
            addView(grabber, LayoutParams(context.dp(45), context.dp(5), Gravity.CENTER))
        }
        sheet.addView(grabberFrame, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, context.dp(22)))
        sheet.addView(sheetHeader(), LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        sheet.addView(sheetBody, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        val dragListener = OnTouchListener { _, event ->
            handleSheetTouch(event)
            true
        }
        grabberFrame.setOnTouchListener(dragListener)
        sheet.setOnTouchListener(dragListener)
    }

    private fun sheetHeader(): View {
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(20), 0, context.dp(20), context.dp(14))
        }
        val texts = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
        }
        texts.addView(TextView(context).apply {
            text = "주변 부탁"
            styleText(19f, ManwonColors.TEXT, Typeface.BOLD)
            tag = "count"
        })
        texts.addView(TextView(context).apply {
            text = "내 위치 기준 1km"
            styleText(13f, ManwonColors.MUTED, Typeface.BOLD)
            tag = "subtitle"
        })
        header.addView(texts, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        return header
    }

    private fun updateSheetHeader() {
        val header = sheet.getChildAt(1) as? LinearLayout ?: return
        val texts = header.getChildAt(0) as? LinearLayout ?: return
        (texts.getChildAt(0) as? TextView)?.text = "주변 부탁 ${posts.size}개"
        (texts.getChildAt(1) as? TextView)?.text = if (locationDenied) "위치 권한을 허용하면 더 정확해요" else "내 위치 기준 1km"
    }

    private fun renderSheetLoading() {
        updateSheetHeader()
        sheetBody.removeAllViews()
        sheetBody.addView(nearbyCenterMessage("주변 부탁을 불러오는 중입니다."))
    }

    private fun renderSheetError(message: String) {
        updateSheetHeader()
        sheetBody.removeAllViews()
        sheetBody.addView(nearbyEmptyView("문제가 생겼어요", message, "다시 불러오기") { reloadNearby() })
    }

    private fun renderSheetBody() {
        updateSheetHeader()
        sheetBody.removeAllViews()
        if (posts.isEmpty()) {
            sheetBody.addView(nearbyEmptyView("근처에 열린 부탁이 없어요", "범위를 넓히거나 홈에서 다른 부탁을 확인해보세요."))
            return
        }

        val scroll = ScrollView(context).apply { isFillViewport = false }
        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(20), 0, context.dp(20), context.dp(132))
        }
        selectedPost()?.let { content.addView(featuredCard(it)) }
        content.addView(TextView(context).apply {
            text = "이런 부탁이 올라왔어요"
            styleText(24f, ManwonColors.TEXT, Typeface.BOLD)
        }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(18)
            bottomMargin = context.dp(12)
        })

        posts.chunked(2).forEach { pair ->
            val row = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            pair.forEach { post ->
                row.addView(postCard(post), LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                    rightMargin = if (post == pair.first()) context.dp(6) else 0
                    leftMargin = if (post == pair.last() && pair.size > 1) context.dp(6) else 0
                })
            }
            if (pair.size == 1) row.addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
            content.addView(row, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = context.dp(12)
            })
        }
        scroll.addView(content)
        sheetBody.addView(scroll, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private fun selectedPost(): TaskPost? {
        return posts.firstOrNull { it.id == selectedPostId } ?: posts.firstOrNull()
    }

    private fun featuredCard(post: TaskPost): View {
        return LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(16), context.dp(14), context.dp(16), context.dp(14))
            background = rounded(ManwonColors.NEARBY_CARD, 18, context = context)
            setOnClickListener { host.openWebPath("/posts/${post.id}") }
            pressFeedback(this)
            addView(TextView(context).apply {
                text = if (post.postType == "offer") "✋" else "🛍"
                gravity = Gravity.CENTER
                styleText(25f, ManwonColors.BRAND, Typeface.BOLD)
                background = circle(ManwonColors.BRAND_SOFT, context = context)
            }, LinearLayout.LayoutParams(context.dp(58), context.dp(58)))
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(context.dp(14), 0, 0, 0)
                addView(TextView(context).apply {
                    text = post.title
                    styleText(17f, ManwonColors.TEXT, Typeface.BOLD, 2)
                })
                addView(TextView(context).apply {
                    text = "${post.distanceText} · ${post.priceText}"
                    styleText(13f, ManwonColors.MUTED, Typeface.BOLD)
                }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    topMargin = context.dp(6)
                })
            }, LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        }
    }

    private fun postCard(post: TaskPost): View {
        val selected = post.id == selectedPostId
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(10), context.dp(10), context.dp(10), context.dp(10))
            background = rounded(if (selected) NearbyPalette.SELECTED_CARD else ManwonColors.NEARBY_CARD, 18, if (selected) NearbyPalette.SELECTED_STROKE else ManwonColors.LINE, 1, context)
            setOnClickListener {
                selectedPostId = post.id
                map.invalidate()
                host.openWebPath("/posts/${post.id}")
            }
            pressFeedback(this)
        }
        val thumb = ImageView(context).apply {
            background = rounded(ManwonColors.BRAND, 15, context = context)
            clipToOutline = true
            loadRemoteImage(api.absoluteUrl(post.images.firstOrNull()?.imageUrl), ManwonColors.BRAND)
        }
        card.addView(thumb, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, context.dp(150)))
        card.addView(TextView(context).apply {
            text = post.title
            styleText(15f, ManwonColors.TEXT, Typeface.BOLD, 2)
        }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(10)
        })
        card.addView(TextView(context).apply {
            text = post.distanceText
            styleText(12f, ManwonColors.MUTED, Typeface.BOLD, 1)
        }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(4)
        })
        card.addView(TextView(context).apply {
            text = post.priceText
            styleText(14f, ManwonColors.BRAND, Typeface.BOLD)
        }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dp(7)
        })
        return card
    }

    private fun handleSheetTouch(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragStartY = event.rawY
                dragStartHeight = sheet.height
                sheet.parent.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                val proposed = dragStartHeight - (event.rawY - dragStartY).toInt()
                applySheetHeight(proposed.coerceIn(detentHeight(SheetDetent.COLLAPSED), detentHeight(SheetDetent.EXPANDED)), animate = false)
                host.setNearbySheetCoversBottomNav(sheet.height > detentHeight(SheetDetent.COLLAPSED) + context.dp(16))
            }
            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_CANCEL -> {
                val current = sheet.height
                val next = SheetDetent.values().minBy { abs(detentHeight(it) - current) }
                setDetent(next)
                sheet.parent.requestDisallowInterceptTouchEvent(false)
            }
        }
    }

    private fun setDetent(next: SheetDetent) {
        detent = next
        applySheetHeight(detentHeight(next), animate = true)
        val expanded = next == SheetDetent.EXPANDED
        writeButton.animate().alpha(if (expanded) 0f else 1f).setDuration(180).start()
        host.setNearbySheetCoversBottomNav(next != SheetDetent.COLLAPSED)
    }

    private fun applySheetHeight(height: Int, animate: Boolean) {
        val params = sheet.layoutParams as LayoutParams
        if (animate) {
            val start = params.height
            val delta = height - start
            val animator = android.animation.ValueAnimator.ofFloat(0f, 1f)
            animator.duration = 260
            animator.interpolator = android.view.animation.DecelerateInterpolator()
            animator.addUpdateListener {
                params.height = start + (delta * (it.animatedValue as Float)).toInt()
                sheet.layoutParams = params
                syncFloatingControls()
                syncSheetBodyVisibility()
            }
            animator.start()
        } else {
            params.height = height
            sheet.layoutParams = params
            syncFloatingControls()
            syncSheetBodyVisibility()
        }
    }

    private fun syncFloatingControls() {
        val bottom = sheet.layoutParams.height + context.dp(24)
        (writeButton.layoutParams as LayoutParams).bottomMargin = bottom
        writeButton.layoutParams = writeButton.layoutParams
        writeButton.text = if (detent == SheetDetent.COLLAPSED) "+" else "+ 글쓰기"
    }

    private fun syncSheetBodyVisibility() {
        val collapsed = detentHeight(SheetDetent.COLLAPSED)
        val progress = ((sheet.layoutParams.height - collapsed - context.dp(28)).toFloat() / context.dp(120))
            .coerceIn(0f, 1f)
        sheetBody.alpha = progress
        sheetBody.visibility = if (progress <= 0.02f) View.INVISIBLE else View.VISIBLE
    }

    private fun detentHeight(target: SheetDetent): Int {
        val h = max(height, resources.displayMetrics.heightPixels)
        return when (target) {
            SheetDetent.COLLAPSED -> min(max(context.dp(252), (h * 0.30f).toInt()), (h * 0.42f).toInt())
            SheetDetent.MEDIUM -> min(max(context.dp(430), (h * 0.52f).toInt()), (h * 0.68f).toInt())
            SheetDetent.EXPANDED -> max(h - context.dp(42), (h * 0.94f).toInt())
        }
    }

    private fun nearbyCenterMessage(message: String): View {
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(context.dp(28), context.dp(36), context.dp(28), context.dp(36))
            setBackgroundColor(ManwonColors.NEARBY_PANEL)
            addView(TextView(context).apply {
                text = message
                gravity = Gravity.CENTER
                styleText(15f, ManwonColors.MUTED, Typeface.BOLD)
            })
        }
    }

    private fun nearbyEmptyView(
        title: String,
        body: String? = null,
        actionTitle: String? = null,
        action: (() -> Unit)? = null
    ): View {
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(context.dp(28), context.dp(42), context.dp(28), context.dp(42))
            setBackgroundColor(ManwonColors.NEARBY_PANEL)
            addView(TextView(context).apply {
                text = "▱"
                gravity = Gravity.CENTER
                styleText(34f, ManwonColors.BRAND, Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = title
                gravity = Gravity.CENTER
                styleText(22f, ManwonColors.TEXT, Typeface.BOLD)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(12)
            })
            if (!body.isNullOrBlank()) {
                addView(TextView(context).apply {
                    text = body
                    gravity = Gravity.CENTER
                    styleText(14f, ManwonColors.MUTED, Typeface.BOLD)
                }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    topMargin = context.dp(10)
                })
            }
            if (actionTitle != null && action != null) {
                val button = TextView(context).apply {
                    text = actionTitle
                    gravity = Gravity.CENTER
                    styleText(15f, Color.WHITE, Typeface.BOLD)
                    background = rounded(ManwonColors.BRAND, 14, context = context)
                    setOnClickListener { action() }
                }
                pressFeedback(button)
                addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, context.dp(48)).apply {
                    topMargin = context.dp(20)
                })
            }
        }
    }
}

class NativeMapView(context: Context) : View(context) {
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = NearbyPalette.MAP_GRID
        strokeWidth = context.dp(2).toFloat()
    }
    private val roadPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = NearbyPalette.MAP_ROAD
        strokeWidth = context.dp(18).toFloat()
        strokeCap = Paint.Cap.ROUND
    }
    private val pinPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textSize = context.dp(12).toFloat()
    }
    private var centerLat = 37.5009
    private var centerLng = 127.0365
    private var posts: List<TaskPost> = emptyList()
    var onSelectPost: ((TaskPost) -> Unit)? = null

    fun setCenter(latitude: Double, longitude: Double) {
        centerLat = latitude
        centerLng = longitude
        invalidate()
    }

    fun setPosts(nextPosts: List<TaskPost>) {
        posts = nextPosts.filter { it.latitude != null && it.longitude != null }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(NearbyPalette.MAP_BACKGROUND)
        drawGrid(canvas)
        drawRoads(canvas)
        drawCurrentLocation(canvas)
        drawPins(canvas)
        canvas.drawColor(0x08FFFFFF)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_UP) {
            posts.firstOrNull { post ->
                val point = pointFor(post)
                abs(event.x - point.first) < context.dp(28) && abs(event.y - point.second) < context.dp(28)
            }?.let {
                onSelectPost?.invoke(it)
                return true
            }
        }
        return true
    }

    private fun drawGrid(canvas: Canvas) {
        val spacing = context.dp(58)
        var x = -width
        while (x < width * 2) {
            canvas.drawLine(x.toFloat(), 0f, (x + height).toFloat(), height.toFloat(), gridPaint)
            canvas.drawLine(x.toFloat(), height.toFloat(), (x + height).toFloat(), 0f, gridPaint)
            x += spacing
        }
    }

    private fun drawRoads(canvas: Canvas) {
        canvas.drawLine(-context.dp(40).toFloat(), (height * 0.38f), (width + context.dp(60)).toFloat(), (height * 0.24f), roadPaint)
        canvas.drawLine((width * 0.12f), -context.dp(40).toFloat(), (width * 0.82f), (height + context.dp(80)).toFloat(), roadPaint)
        canvas.drawLine(-context.dp(60).toFloat(), (height * 0.72f), (width + context.dp(40)).toFloat(), (height * 0.58f), roadPaint)
    }

    private fun drawCurrentLocation(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        pinPaint.color = 0x553B73FF
        canvas.drawCircle(cx, cy, context.dp(40).toFloat(), pinPaint)
        pinPaint.color = 0xFF3B73FF.toInt()
        canvas.drawCircle(cx, cy, context.dp(17).toFloat(), pinPaint)
        pinPaint.color = Color.WHITE
        canvas.drawCircle(cx, cy, context.dp(10).toFloat(), pinPaint)
    }

    private fun drawPins(canvas: Canvas) {
        posts.forEach { post ->
            val point = pointFor(post)
            pinPaint.color = ManwonColors.BRAND
            canvas.drawCircle(point.first, point.second, context.dp(20).toFloat(), pinPaint)
            pinPaint.color = Color.WHITE
            canvas.drawCircle(point.first, point.second, context.dp(14).toFloat(), pinPaint)
            textPaint.color = ManwonColors.BRAND
            canvas.drawText((post.price / 1000).coerceIn(1, 99).toString(), point.first, point.second + context.dp(4), textPaint)
        }
    }

    private fun pointFor(post: TaskPost): Pair<Float, Float> {
        val lat = post.latitude ?: centerLat
        val lng = post.longitude ?: centerLng
        val metersPerDegLat = 111_000.0
        val metersPerDegLng = 111_000.0 * cos(Math.toRadians(centerLat))
        val dx = ((lng - centerLng) * metersPerDegLng).coerceIn(-900.0, 900.0)
        val dy = ((lat - centerLat) * metersPerDegLat).coerceIn(-900.0, 900.0)
        val scale = min(width, height) / 2200f
        return Pair((width / 2f + dx * scale).toFloat(), (height / 2f - dy * scale).toFloat())
    }
}
