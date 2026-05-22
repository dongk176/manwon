package com.manwon.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
class WebTabView(
    context: Context,
    private val title: String,
    private val onNativeRoute: (String) -> Unit,
    private val onProfileOnboardingCompleted: () -> Unit = {},
    private val onRouteChange: (String) -> Unit,
    private val onScrollTopChange: ((Boolean) -> Unit)? = null,
    private val onFinished: () -> Unit
) : FrameLayout(context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val webView = WebView(context)
    private val splash = splashView()
    private val error = errorView()
    private var currentPath: String? = null
    private var lastIsAtTop = true

    init {
        setBackgroundColor(ManwonColors.SURFACE)
        configureWebView()
        addView(webView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(splash, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(error, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        error.visibility = View.GONE
    }

    fun loadPath(path: String) {
        if (currentPath == path) return
        currentPath = path
        updateScrollTopState(true)
        onRouteChange(path)
        showSplash()
        webView.loadUrl(AppConfig.webUrl(context, path))
    }

    fun canGoBack(): Boolean = webView.canGoBack()

    fun goBack() {
        webView.goBack()
    }

    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            userAgentString = userAgentString + " ManwonAndroid/1.0 NativeAndroidShell"
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.isHorizontalScrollBarEnabled = false
        webView.isVerticalScrollBarEnabled = false
        webView.overScrollMode = OVER_SCROLL_NEVER
        webView.setOnScrollChangeListener { _, _, scrollY, _, _ ->
            updateScrollTopState(scrollY <= context.dp(8))
        }
        webView.addJavascriptInterface(AndroidBridge(), "ManwonNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleUrl(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleUrl(Uri.parse(url))
            }

            override fun onPageFinished(view: WebView, url: String) {
                val path = AppConfig.pathWithQuery(Uri.parse(url))
                currentPath = path
                onRouteChange(path)
                injectNativeShell()
                CookieManager.getInstance().flush()
                mainHandler.postDelayed({
                    splash.animate().alpha(0f).setDuration(160).withEndAction {
                        splash.visibility = View.GONE
                    }.start()
                    onFinished()
                }, 120)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, errorValue: WebResourceError) {
                if (request.isForMainFrame) showError()
            }
        }
    }

    private fun updateScrollTopState(isAtTop: Boolean) {
        if (lastIsAtTop == isAtTop) return
        lastIsAtTop = isAtTop
        onScrollTopChange?.invoke(isAtTop)
    }

    private fun handleUrl(uri: Uri): Boolean {
        val scheme = uri.scheme.orEmpty().lowercase()
        if (scheme != "http" && scheme != "https") {
            openExternal(uri)
            return true
        }

        if (!AppConfig.isAllowedHost(context, uri.host)) {
            openExternal(uri)
            return true
        }

        val path = AppConfig.pathWithQuery(uri)
        if (AppConfig.isNativeRoute(uri.path.orEmpty())) {
            onNativeRoute(path)
            return true
        }

        onRouteChange(path)
        return false
    }

    private fun openExternal(uri: Uri) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun injectNativeShell() {
        webView.evaluateJavascript(nativeShellScript(), null)
    }

    private fun showSplash() {
        error.visibility = View.GONE
        splash.alpha = 1f
        splash.visibility = View.VISIBLE
    }

    private fun showError() {
        splash.visibility = View.GONE
        error.alpha = 0f
        error.visibility = View.VISIBLE
        error.animate().alpha(1f).setDuration(160).start()
    }

    private fun splashView(): View {
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(ManwonColors.SURFACE)
            val logo = TextView(context).apply {
                text = "+"
                gravity = Gravity.CENTER
                styleText(44f, ManwonColors.BRAND, Typeface.BOLD)
                background = circle(ManwonColors.BRAND_SOFT, context = context)
            }
            addView(logo, LinearLayout.LayoutParams(context.dp(92), context.dp(92)))
            addView(label(context, title, 27f, ManwonColors.TEXT, Typeface.BOLD).apply {
                gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(14)
            })
        }
    }

    private fun errorView(): View {
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(context.dp(28), context.dp(28), context.dp(28), context.dp(28))
            setBackgroundColor(ManwonColors.SURFACE)
            addView(TextView(context).apply {
                text = "문제가 생겼어요"
                gravity = Gravity.CENTER
                styleText(22f, ManwonColors.TEXT, Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = "네트워크 상태를 확인한 뒤 다시 시도해주세요."
                gravity = Gravity.CENTER
                styleText(15f, ManwonColors.MUTED, Typeface.BOLD)
            }, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dp(10)
            })
            val retry = TextView(context).apply {
                text = "다시 시도"
                gravity = Gravity.CENTER
                styleText(16f, ManwonColors.SURFACE, Typeface.BOLD)
                background = rounded(ManwonColors.BRAND, 14, context = context)
                setOnClickListener {
                    currentPath?.let {
                        currentPath = null
                        loadPath(it)
                    }
                }
            }
            pressFeedback(retry)
            addView(retry, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, context.dp(50)).apply {
                topMargin = context.dp(22)
            })
        }
    }

    private inner class AndroidBridge {
        @JavascriptInterface
        fun route(path: String) {
            mainHandler.post {
                onNativeRoute(path)
            }
        }

        @JavascriptInterface
        fun routeChanged(path: String) {
            mainHandler.post {
                onRouteChange(path)
            }
        }

        @JavascriptInterface
        fun postMessage(raw: String) {
            runCatching {
                val payload = JSONObject(raw)
                if (payload.optString("type") == "route") route(payload.optString("path"))
                if (payload.optString("type") == "routeChanged") routeChanged(payload.optString("path"))
                if (payload.optString("type") == "profileOnboardingCompleted") mainHandler.post { onProfileOnboardingCompleted() }
                if (payload.optString("type") == "homeScrollTop") homeScrollTopChanged(payload.optBoolean("isAtTop", true))
            }
        }

        @JavascriptInterface
        fun homeScrollTopChanged(isAtTop: Boolean) {
            mainHandler.post {
                updateScrollTopState(isAtTop)
            }
        }
    }

    private fun nativeShellScript(): String = """
        (function() {
          var lockedViewportContent = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no';
          var viewport = document.querySelector('meta[name="viewport"]');
          if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
          }
          viewport.setAttribute('content', lockedViewportContent);
          document.documentElement.classList.add('native-ios-shell');
          document.documentElement.classList.add('native-android-shell');
          if (document.body) {
            document.body.classList.add('native-ios-shell');
            document.body.classList.add('native-android-shell');
          }
          if (!document.getElementById('native-android-shell-style')) {
            var style = document.createElement('style');
            style.id = 'native-android-shell-style';
            style.textContent = '.bottom-nav{display:none!important}.app-shell{max-width:100%!important;box-shadow:none!important}.screen{padding-bottom:110px!important}.profile-flow-page{padding-bottom:148px!important}.auth-shell .screen{padding-bottom:24px!important}';
            document.head.appendChild(style);
          }
          if (window.__manwonAndroidBridgeInstalled) return;
          window.__manwonAndroidBridgeInstalled = true;
          function shouldNativeRoute(path) {
            return path === '/chat' || path.indexOf('/chat/') === 0 || path === '/activity' || path.indexOf('/activity/') === 0 || path === '/nearby' || path.indexOf('/nearby/') === 0;
          }
          function postNativeRoute(rawUrl) {
            try {
              var target = new URL(rawUrl, window.location.origin);
              if (!shouldNativeRoute(target.pathname)) return false;
              ManwonNative.route(target.pathname + target.search);
              return true;
            } catch (error) {
              return false;
            }
          }
          function routePath(rawUrl) {
            try {
              var target = new URL(rawUrl || window.location.href, window.location.origin);
              return target.pathname + target.search;
            } catch (error) {
              return window.location.pathname + window.location.search;
            }
          }
          function notifyRouteChanged(rawUrl) {
            try {
              ManwonNative.routeChanged(routePath(rawUrl));
            } catch (error) {}
          }
          var scrollWatch = {
            scroller: null,
            lastIsAtTop: null,
            frame: 0,
            observer: null
          };
          function currentHomeScroller() {
            return document.querySelector('.home-feed-scroll') || document.scrollingElement || document.documentElement;
          }
          function notifyHomeScrollTop(isAtTop) {
            if (scrollWatch.lastIsAtTop === isAtTop) return;
            scrollWatch.lastIsAtTop = isAtTop;
            try {
              ManwonNative.homeScrollTopChanged(isAtTop);
            } catch (error) {
              try {
                ManwonNative.postMessage(JSON.stringify({
                  type: 'homeScrollTop',
                  path: window.location.pathname + window.location.search,
                  isAtTop: isAtTop
                }));
              } catch (ignored) {}
            }
          }
          function readHomeScrollTop() {
            var scroller = scrollWatch.scroller || currentHomeScroller();
            var scrollTop = scroller ? scroller.scrollTop : 0;
            notifyHomeScrollTop(scrollTop <= 12);
          }
          function scheduleHomeScrollTop() {
            if (scrollWatch.frame) return;
            scrollWatch.frame = window.requestAnimationFrame(function() {
              scrollWatch.frame = 0;
              readHomeScrollTop();
            });
          }
          function bindHomeScroller() {
            var nextScroller = currentHomeScroller();
            if (scrollWatch.scroller !== nextScroller) {
              if (scrollWatch.scroller) scrollWatch.scroller.removeEventListener('scroll', scheduleHomeScrollTop);
              scrollWatch.scroller = nextScroller;
              if (scrollWatch.scroller) scrollWatch.scroller.addEventListener('scroll', scheduleHomeScrollTop, { passive: true });
            }
            scheduleHomeScrollTop();
          }
          var originalPushState = history.pushState;
          history.pushState = function(state, title, url) {
            if (url && postNativeRoute(url)) return;
            var result = originalPushState.apply(this, arguments);
            notifyRouteChanged(url);
            setTimeout(bindHomeScroller, 0);
            return result;
          };
          var originalReplaceState = history.replaceState;
          history.replaceState = function(state, title, url) {
            if (url && postNativeRoute(url)) return;
            var result = originalReplaceState.apply(this, arguments);
            notifyRouteChanged(url);
            setTimeout(bindHomeScroller, 0);
            return result;
          };
          window.addEventListener('popstate', function() {
            notifyRouteChanged(window.location.href);
            setTimeout(bindHomeScroller, 0);
          });
          document.addEventListener('click', function(event) {
            var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!anchor) return;
            if (postNativeRoute(anchor.href)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }, true);
          if (window.MutationObserver && document.body) {
            scrollWatch.observer = new MutationObserver(bindHomeScroller);
            scrollWatch.observer.observe(document.body, { childList: true, subtree: true });
          }
          notifyRouteChanged(window.location.href);
          bindHomeScroller();
        })();
    """.trimIndent()
}
