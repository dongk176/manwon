package com.manwon.app

import android.app.Application
import android.webkit.CookieManager
import android.webkit.WebView

class ManwonApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        WebView.setWebContentsDebuggingEnabled(true)
        CookieManager.getInstance().setAcceptCookie(true)
    }
}
