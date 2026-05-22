import SwiftUI
import UIKit
import WebKit

struct WebTabView: View {
    let tab: AppTab
    let title: String
    @Binding var path: String
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    @State private var reloadToken = UUID()
    @State private var isShowingSplash = true
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            NativeWebView(
                path: path,
                reloadToken: reloadToken,
                onNativeRoute: { routePath in
                    router.openNativeRoute(path: routePath)
                },
                onRouteChange: { routePath in
                    router.webRouteDidChange(routePath, for: tab)
                },
                onPermissionPrompt: { permission, context, unreadCount in
                    permissionPrompts.handleWebPermissionPrompt(
                        permission: permission,
                        context: context,
                        unreadCount: unreadCount
                    )
                },
                onScrollTopChange: { isAtTop in
                    if tab == .home {
                        router.homeScrollDidChange(isAtTop: isAtTop)
                    }
                },
                onStartLoading: {
                    errorMessage = nil
                },
                onFinishLoading: {
                    PushManager.shared.submitPendingToken()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                        isShowingSplash = false
                    }
                },
                onError: {
                    isShowingSplash = false
                    errorMessage = "네트워크 상태를 확인한 뒤 다시 시도해주세요."
                }
            )
            .ignoresSafeArea(edges: .bottom)

            if isShowingSplash && errorMessage == nil {
                SplashView(title: title)
                    .transition(.opacity)
            }

            if let errorMessage {
                ErrorContent(message: errorMessage) {
                    self.errorMessage = nil
                    isShowingSplash = true
                    reloadToken = UUID()
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: isShowingSplash)
        .animation(.easeInOut(duration: 0.18), value: errorMessage)
    }
}

private struct SplashView: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            Image("LaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 112, height: 112)
            Text(title)
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(ManwonColor.text)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ManwonColor.surface)
    }
}

struct NativeWebView: UIViewRepresentable {
    let path: String
    let reloadToken: UUID
    let onNativeRoute: (String) -> Void
    let onRouteChange: (String) -> Void
    let onPermissionPrompt: (String, String?, Int?) -> Void
    let onScrollTopChange: (Bool) -> Void
    let onStartLoading: () -> Void
    let onFinishLoading: () -> Void
    let onError: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onNativeRoute: onNativeRoute,
            onRouteChange: onRouteChange,
            onPermissionPrompt: onPermissionPrompt,
            onScrollTopChange: onScrollTopChange,
            onStartLoading: onStartLoading,
            onFinishLoading: onFinishLoading,
            onError: onError
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(source: Self.nativeShellScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        userContentController.add(context.coordinator, name: "manwonNative")

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = "ManwonIOS/1.0 NativeIOSShell"
        configuration.websiteDataStore = .default()
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.backgroundColor = .white
        webView.scrollView.backgroundColor = .white
        webView.scrollView.delegate = context.coordinator
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        context.coordinator.load(path: path, in: webView, reloadToken: reloadToken)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onNativeRoute = onNativeRoute
        context.coordinator.onRouteChange = onRouteChange
        context.coordinator.onPermissionPrompt = onPermissionPrompt
        context.coordinator.onScrollTopChange = onScrollTopChange
        context.coordinator.onStartLoading = onStartLoading
        context.coordinator.onFinishLoading = onFinishLoading
        context.coordinator.onError = onError
        context.coordinator.load(path: path, in: webView, reloadToken: reloadToken)
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.scrollView.delegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "manwonNative")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
        var onNativeRoute: (String) -> Void
        var onRouteChange: (String) -> Void
        var onPermissionPrompt: (String, String?, Int?) -> Void
        var onScrollTopChange: (Bool) -> Void
        var onStartLoading: () -> Void
        var onFinishLoading: () -> Void
        var onError: () -> Void
        private var currentPath: String?
        private var currentReloadToken: UUID?
        private var lastIsAtTop = true

        init(
            onNativeRoute: @escaping (String) -> Void,
            onRouteChange: @escaping (String) -> Void,
            onPermissionPrompt: @escaping (String, String?, Int?) -> Void,
            onScrollTopChange: @escaping (Bool) -> Void,
            onStartLoading: @escaping () -> Void,
            onFinishLoading: @escaping () -> Void,
            onError: @escaping () -> Void
        ) {
            self.onNativeRoute = onNativeRoute
            self.onRouteChange = onRouteChange
            self.onPermissionPrompt = onPermissionPrompt
            self.onScrollTopChange = onScrollTopChange
            self.onStartLoading = onStartLoading
            self.onFinishLoading = onFinishLoading
            self.onError = onError
        }

        func load(path: String, in webView: WKWebView, reloadToken: UUID) {
            guard currentPath != path || currentReloadToken != reloadToken else { return }
            currentPath = path
            currentReloadToken = reloadToken
            lastIsAtTop = true
            onScrollTopChange(true)
            onRouteChange(path)
            webView.load(URLRequest(url: AppConfig.webURL(path: path)))
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "manwonNative" else { return }
            guard
                let payload = message.body as? [String: Any],
                let type = payload["type"] as? String
            else {
                return
            }

            if type == "permissionPrompt" {
                let permission = payload["permission"] as? String ?? "push"
                let context = payload["context"] as? String
                let unreadNumber = payload["unreadCount"] as? NSNumber
                let unreadCount = unreadNumber?.intValue ?? payload["unreadCount"] as? Int
                onPermissionPrompt(permission, context, unreadCount)
                return
            }

            if type == "openSettings" {
                if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(settingsURL)
                }
                return
            }

            guard let path = payload["path"] as? String else { return }

            if type == "route" {
                onNativeRoute(path)
                return
            }

            if type == "webRoute" {
                onRouteChange(path)
                return
            }

            if type == "homeScrollTop" {
                let isAtTop = (payload["isAtTop"] as? Bool) ?? true
                onScrollTopChange(isAtTop)
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            onStartLoading()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if let url = webView.url {
                onRouteChange(AppConfig.pathWithQuery(from: url))
            }
            webView.scrollView.setZoomScale(1, animated: false)
            onFinishLoading()
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            nil
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            let topOffset = -scrollView.adjustedContentInset.top
            let isAtTop = scrollView.contentOffset.y <= topOffset + 12
            guard isAtTop != lastIsAtTop else { return }
            lastIsAtTop = isAtTop
            onScrollTopChange(isAtTop)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handle(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handle(error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if shouldOpenExternally(targetURL) {
                UIApplication.shared.open(targetURL)
                decisionHandler(.cancel)
                return
            }

            guard isAllowedHost(targetURL.host) else {
                UIApplication.shared.open(targetURL)
                decisionHandler(.cancel)
                return
            }

            let routePath = AppConfig.pathWithQuery(from: targetURL)
            if isNativeRoute(targetURL.path) {
                onNativeRoute(routePath)
                decisionHandler(.cancel)
                return
            }

            onRouteChange(routePath)
            decisionHandler(.allow)
        }

        private func handle(_ error: Error) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }
            onError()
        }

        private func shouldOpenExternally(_ url: URL) -> Bool {
            guard let scheme = url.scheme?.lowercased() else { return true }
            return scheme != "http" && scheme != "https"
        }

        private func isAllowedHost(_ host: String?) -> Bool {
            guard let host else { return false }
            let baseHost = AppConfig.webBaseURL.host ?? ""
            return host == baseHost || host == "localhost" || host == "127.0.0.1"
        }

        private func isNativeRoute(_ path: String) -> Bool {
            path == "/chat" || path.hasPrefix("/chat/") || path == "/activity" || path.hasPrefix("/activity/") || path == "/nearby" || path.hasPrefix("/nearby/")
        }
    }

    private static let nativeShellScript = """
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
      if (document.body) document.body.classList.add('native-ios-shell');
      if (!document.getElementById('native-ios-shell-style')) {
        var style = document.createElement('style');
        style.id = 'native-ios-shell-style';
        style.textContent = '.bottom-nav{display:none!important}.app-shell{max-width:100%!important;box-shadow:none!important}.screen{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}.auth-shell .screen{padding-bottom:calc(20px + env(safe-area-inset-bottom))!important}';
        document.head.appendChild(style);
      }
      if (window.__manwonNativeBridgeInstalled) return;
      window.__manwonNativeBridgeInstalled = true;
      function shouldNativeRoute(path) {
        return path === '/chat' || path.indexOf('/chat/') === 0 || path === '/activity' || path.indexOf('/activity/') === 0 || path === '/nearby' || path.indexOf('/nearby/') === 0;
      }
      function routePathFromUrl(rawUrl) {
        try {
          var target = new URL(rawUrl, window.location.origin);
          return target.pathname + target.search;
        } catch (error) {
          return window.location.pathname + window.location.search;
        }
      }
      function postWebRoute(rawUrl) {
        try {
          window.webkit.messageHandlers.manwonNative.postMessage({
            type: 'webRoute',
            path: rawUrl ? routePathFromUrl(rawUrl) : window.location.pathname + window.location.search
          });
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
      function postHomeScrollTop(isAtTop) {
        if (scrollWatch.lastIsAtTop === isAtTop) return;
        scrollWatch.lastIsAtTop = isAtTop;
        try {
          window.webkit.messageHandlers.manwonNative.postMessage({
            type: 'homeScrollTop',
            path: window.location.pathname + window.location.search,
            isAtTop: isAtTop
          });
        } catch (error) {}
      }
      function readHomeScrollTop() {
        var scroller = scrollWatch.scroller || currentHomeScroller();
        var scrollTop = scroller ? scroller.scrollTop : 0;
        postHomeScrollTop(scrollTop <= 12);
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
      function postNativeRoute(rawUrl) {
        try {
          var target = new URL(rawUrl, window.location.origin);
          if (!shouldNativeRoute(target.pathname)) return false;
          window.webkit.messageHandlers.manwonNative.postMessage({ type: 'route', path: target.pathname + target.search });
          return true;
        } catch (error) {
          return false;
        }
      }
      postWebRoute();
      var originalPushState = history.pushState;
      history.pushState = function(state, title, url) {
        if (url && postNativeRoute(url)) return;
        var result = originalPushState.apply(this, arguments);
        postWebRoute(url);
        setTimeout(bindHomeScroller, 0);
        return result;
      };
      var originalReplaceState = history.replaceState;
      history.replaceState = function(state, title, url) {
        if (url && postNativeRoute(url)) return;
        var result = originalReplaceState.apply(this, arguments);
        postWebRoute(url);
        setTimeout(bindHomeScroller, 0);
        return result;
      };
      window.addEventListener('popstate', function() {
        setTimeout(function() {
          postWebRoute();
          bindHomeScroller();
        }, 0);
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
      bindHomeScroller();
    })();
    """
}
