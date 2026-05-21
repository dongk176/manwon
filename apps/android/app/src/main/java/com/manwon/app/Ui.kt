package com.manwon.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.TextView

object ManwonColors {
    const val BRAND = 0xFFFF4800.toInt()
    const val BRAND_SOFT = 0xFFFFF0EB.toInt()
    const val TEXT = 0xFF101010.toInt()
    const val MUTED = 0xFF77777C.toInt()
    const val LINE = 0xFFE9E9EC.toInt()
    const val SURFACE = Color.WHITE
    const val BACKGROUND = 0xFFF6F6F7.toInt()
    const val NEARBY_PANEL = Color.WHITE
    const val NEARBY_CARD = 0xFFF8F8FA.toInt()
}

fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

fun rounded(color: Int, radiusDp: Int, strokeColor: Int? = null, strokeDp: Int = 1, context: Context): GradientDrawable {
    return GradientDrawable().apply {
        setColor(color)
        cornerRadius = context.dp(radiusDp).toFloat()
        if (strokeColor != null) setStroke(context.dp(strokeDp), strokeColor)
    }
}

fun circle(color: Int, strokeColor: Int? = null, strokeDp: Int = 1, context: Context): GradientDrawable {
    return GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
        if (strokeColor != null) setStroke(context.dp(strokeDp), strokeColor)
    }
}

fun TextView.styleText(
    sizeSp: Float,
    color: Int = ManwonColors.TEXT,
    weight: Int = Typeface.NORMAL,
    maxLinesValue: Int? = null
) {
    textSize = sizeSp
    setTextColor(color)
    typeface = Typeface.create(Typeface.DEFAULT, weight)
    includeFontPadding = true
    if (maxLinesValue != null) maxLines = maxLinesValue
}

fun View.fadeIn(duration: Long = 180L) {
    alpha = 0f
    animate()
        .alpha(1f)
        .setDuration(duration)
        .setInterpolator(DecelerateInterpolator())
        .start()
}

fun pressFeedback(view: View) {
    view.setOnTouchListener { target, event ->
        when (event.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> target.animate().scaleX(0.96f).scaleY(0.96f).alpha(0.86f).setDuration(80).start()
            android.view.MotionEvent.ACTION_UP,
            android.view.MotionEvent.ACTION_CANCEL -> target.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(120).start()
        }
        false
    }
}

fun label(context: Context, text: String, sizeSp: Float, color: Int, weight: Int = Typeface.NORMAL): TextView {
    return TextView(context).apply {
        this.text = text
        gravity = Gravity.CENTER_VERTICAL
        styleText(sizeSp, color, weight)
    }
}
