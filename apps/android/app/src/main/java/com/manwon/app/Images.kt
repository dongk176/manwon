package com.manwon.app

import android.graphics.BitmapFactory
import android.widget.ImageView
import java.net.URL

fun ImageView.loadRemoteImage(url: String?, placeholderColor: Int = ManwonColors.BRAND_SOFT) {
    setBackgroundColor(placeholderColor)
    if (url.isNullOrBlank()) return
    runAsync({
        URL(url).openStream().use { BitmapFactory.decodeStream(it) }
    }) { result ->
        result.getOrNull()?.let { bitmap ->
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.CENTER_CROP
        }
    }
}
