import CoreLocation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers
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
    @State private var splashFallbackTask: Task<Void, Never>?
    @State private var initialLoadFinished = false

    var body: some View {
        ZStack {
            NativeWebView(
                path: path,
                reloadToken: reloadToken,
                onNativeRoute: { routePath in
                    router.openNativeRoute(path: routePath)
                },
                onProfileOnboardingCompleted: {
                    router.completeProfileOnboarding()
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
                onOverlayChange: { isPresented in
                    router.webOverlayDidChange(isPresented: isPresented, for: tab)
                },
                onScrollTopChange: { isAtTop in
                    if tab == .home {
                        router.homeScrollDidChange(isAtTop: isAtTop)
                    }
                },
                onStartLoading: {
                    router.webOverlayDidChange(isPresented: false, for: tab)
                    errorMessage = nil
                    if !initialLoadFinished {
                        isShowingSplash = true
                        startSplashFallback()
                    }
                },
                onFinishLoading: {
                    PushManager.shared.submitPendingToken()
                    hideSplashSoon()
                },
                onError: {
                    splashFallbackTask?.cancel()
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
                    initialLoadFinished = false
                    isShowingSplash = true
                    reloadToken = UUID()
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: isShowingSplash)
        .animation(.easeInOut(duration: 0.18), value: errorMessage)
        .onAppear {
            startSplashFallback()
        }
        .onDisappear {
            splashFallbackTask?.cancel()
        }
        .onChange(of: router.selectedTab) { selectedTab in
            guard tab == .nearby, selectedTab == .nearby else { return }
            reloadToken = UUID()
        }
    }

    private func hideSplashSoon() {
        splashFallbackTask?.cancel()
        initialLoadFinished = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            isShowingSplash = false
        }
    }

    private func startSplashFallback() {
        splashFallbackTask?.cancel()
        splashFallbackTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard !Task.isCancelled, errorMessage == nil else { return }
            initialLoadFinished = true
            isShowingSplash = false
        }
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
    let onProfileOnboardingCompleted: () -> Void
    let onRouteChange: (String) -> Void
    let onPermissionPrompt: (String, String?, Int?) -> Void
    let onOverlayChange: (Bool) -> Void
    let onScrollTopChange: (Bool) -> Void
    let onStartLoading: () -> Void
    let onFinishLoading: () -> Void
    let onError: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onNativeRoute: onNativeRoute,
            onProfileOnboardingCompleted: onProfileOnboardingCompleted,
            onRouteChange: onRouteChange,
            onPermissionPrompt: onPermissionPrompt,
            onOverlayChange: onOverlayChange,
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
        webView.uiDelegate = context.coordinator
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
        context.coordinator.onProfileOnboardingCompleted = onProfileOnboardingCompleted
        context.coordinator.onRouteChange = onRouteChange
        context.coordinator.onPermissionPrompt = onPermissionPrompt
        context.coordinator.onOverlayChange = onOverlayChange
        context.coordinator.onScrollTopChange = onScrollTopChange
        context.coordinator.onStartLoading = onStartLoading
        context.coordinator.onFinishLoading = onFinishLoading
        context.coordinator.onError = onError
        context.coordinator.load(path: path, in: webView, reloadToken: reloadToken)
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.scrollView.delegate = nil
        uiView.uiDelegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "manwonNative")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate, CLLocationManagerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate {
        var onNativeRoute: (String) -> Void
        var onProfileOnboardingCompleted: () -> Void
        var onRouteChange: (String) -> Void
        var onPermissionPrompt: (String, String?, Int?) -> Void
        var onOverlayChange: (Bool) -> Void
        var onScrollTopChange: (Bool) -> Void
        var onStartLoading: () -> Void
        var onFinishLoading: () -> Void
        var onError: () -> Void
        private var currentPath: String?
        private var requestedPath: String?
        private var currentReloadToken: UUID?
        private var lastIsAtTop = true
        private let locationManager = CLLocationManager()
        private weak var webView: WKWebView?
        private var pendingLocationRequestId: String?
        private var locationTimeoutTask: Task<Void, Never>?
        private var filePickerCompletion: (([URL]?) -> Void)?

        init(
            onNativeRoute: @escaping (String) -> Void,
            onProfileOnboardingCompleted: @escaping () -> Void,
            onRouteChange: @escaping (String) -> Void,
            onPermissionPrompt: @escaping (String, String?, Int?) -> Void,
            onOverlayChange: @escaping (Bool) -> Void,
            onScrollTopChange: @escaping (Bool) -> Void,
            onStartLoading: @escaping () -> Void,
            onFinishLoading: @escaping () -> Void,
            onError: @escaping () -> Void
        ) {
            self.onNativeRoute = onNativeRoute
            self.onProfileOnboardingCompleted = onProfileOnboardingCompleted
            self.onRouteChange = onRouteChange
            self.onPermissionPrompt = onPermissionPrompt
            self.onOverlayChange = onOverlayChange
            self.onScrollTopChange = onScrollTopChange
            self.onStartLoading = onStartLoading
            self.onFinishLoading = onFinishLoading
            self.onError = onError
            super.init()
            locationManager.delegate = self
            locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        }

        func load(path: String, in webView: WKWebView, reloadToken: UUID) {
            self.webView = webView
            guard requestedPath != path || currentReloadToken != reloadToken else { return }
            requestedPath = path
            currentPath = path
            currentReloadToken = reloadToken
            lastIsAtTop = true
            DispatchQueue.main.async { [weak self] in
                self?.onScrollTopChange(true)
            }
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

            if type == "overlayState" {
                let isPresented = (payload["isPresented"] as? Bool) ?? false
                onOverlayChange(isPresented)
                return
            }

            if type == "profileOnboardingCompleted" {
                onProfileOnboardingCompleted()
                return
            }

            if type == "requestLocation" {
                let requestId = payload["requestId"] as? String ?? UUID().uuidString
                requestCurrentLocation(requestId: requestId)
                return
            }

            guard let path = payload["path"] as? String else { return }

            if type == "route" {
                onNativeRoute(path)
                return
            }

            if type == "webRoute" {
                currentPath = path
                requestedPath = path
                onRouteChange(path)
                return
            }

            if type == "homeScrollTop" {
                let isAtTop = (payload["isAtTop"] as? Bool) ?? true
                onScrollTopChange(isAtTop)
            }
        }

        private func requestCurrentLocation(requestId: String) {
            pendingLocationRequestId = requestId
            locationTimeoutTask?.cancel()
            locationTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 9_000_000_000)
                await MainActor.run {
                    self?.completeLocationRequest(ok: false, error: "현재 위치를 가져오지 못했습니다.")
                }
            }

            switch locationManager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                locationManager.requestLocation()
            case .notDetermined:
                locationManager.requestWhenInUseAuthorization()
            case .denied, .restricted:
                completeLocationRequest(ok: false, error: "위치 권한이 꺼져 있어요. 설정에서 위치 권한을 허용해주세요.")
            @unknown default:
                locationManager.requestLocation()
            }
        }

        func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            guard pendingLocationRequestId != nil else { return }
            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                manager.requestLocation()
            case .denied, .restricted:
                completeLocationRequest(ok: false, error: "위치 권한이 꺼져 있어요. 설정에서 위치 권한을 허용해주세요.")
            default:
                break
            }
        }

        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            guard let location = locations.last else {
                completeLocationRequest(ok: false, error: "현재 위치를 가져오지 못했습니다.")
                return
            }
            completeLocationRequest(ok: true, latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
        }

        func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
            completeLocationRequest(ok: false, error: "현재 위치를 가져오지 못했습니다.")
        }

        private func completeLocationRequest(ok: Bool, latitude: Double? = nil, longitude: Double? = nil, error: String? = nil) {
            guard let requestId = pendingLocationRequestId else { return }
            pendingLocationRequestId = nil
            locationTimeoutTask?.cancel()
            locationTimeoutTask = nil

            var payload: [String: Any] = [
                "requestId": requestId,
                "ok": ok,
            ]
            if let latitude, let longitude {
                payload["latitude"] = latitude
                payload["longitude"] = longitude
            }
            if let error {
                payload["error"] = error
            }

            guard
                let data = try? JSONSerialization.data(withJSONObject: payload),
                let json = String(data: data, encoding: .utf8)
            else {
                return
            }
            webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('manwonNativeLocation', { detail: \(json) }));")
        }

        @available(iOS 18.4, *)
        func webView(
            _ webView: WKWebView,
            runOpenPanelWith parameters: WKOpenPanelParameters,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping ([URL]?) -> Void
        ) {
            guard filePickerCompletion == nil else {
                completionHandler(nil)
                return
            }

            filePickerCompletion = completionHandler
            let pickerSheet = UIAlertController(title: "사진 첨부", message: nil, preferredStyle: .actionSheet)

            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                pickerSheet.addAction(UIAlertAction(title: "사진 촬영", style: .default) { [weak self] _ in
                    self?.presentCameraPicker()
                })
            }

            pickerSheet.addAction(UIAlertAction(title: "사진 보관함", style: .default) { [weak self] _ in
                self?.presentPhotoLibraryPicker(allowsMultipleSelection: parameters.allowsMultipleSelection)
            })
            pickerSheet.addAction(UIAlertAction(title: "취소", style: .cancel) { [weak self] _ in
                self?.finishFilePicker(with: nil)
            })

            if let popover = pickerSheet.popoverPresentationController {
                popover.sourceView = webView
                popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 1, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }

            guard let presenter = topViewController() else {
                finishFilePicker(with: nil)
                return
            }
            presenter.present(pickerSheet, animated: true)
        }

        private func presentCameraPicker() {
            guard UIImagePickerController.isSourceTypeAvailable(.camera), let presenter = topViewController() else {
                finishFilePicker(with: nil)
                return
            }

            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.mediaTypes = [UTType.image.identifier]
            picker.delegate = self
            presenter.present(picker, animated: true)
        }

        private func presentPhotoLibraryPicker(allowsMultipleSelection: Bool) {
            guard let presenter = topViewController() else {
                finishFilePicker(with: nil)
                return
            }

            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.filter = .images
            configuration.selectionLimit = allowsMultipleSelection ? 0 : 1

            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            presenter.present(picker, animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true) { [weak self] in
                self?.finishFilePicker(with: nil)
            }
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            let image = info[.originalImage] as? UIImage
            let imageURL = info[.imageURL] as? URL

            picker.dismiss(animated: true) { [weak self] in
                if let imageURL {
                    self?.finishFilePicker(with: [imageURL])
                    return
                }

                guard let data = image?.jpegData(compressionQuality: 0.94),
                      let url = self?.temporaryImageURL(data: data, fileExtension: "jpg")
                else {
                    self?.finishFilePicker(with: nil)
                    return
                }
                self?.finishFilePicker(with: [url])
            }
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard !results.isEmpty else {
                finishFilePicker(with: nil)
                return
            }

            Task { [weak self] in
                var urls: [URL] = []
                for result in results {
                    guard let self else { return }
                    guard let data = await self.loadImageData(from: result.itemProvider) else {
                        continue
                    }
                    let uploadData = UIImage(data: data)?.jpegData(compressionQuality: 0.94) ?? data
                    guard let url = self.temporaryImageURL(data: uploadData, fileExtension: "jpg")
                    else {
                        continue
                    }
                    urls.append(url)
                }

                await MainActor.run {
                    self?.finishFilePicker(with: urls.isEmpty ? nil : urls)
                }
            }
        }

        private func loadImageData(from provider: NSItemProvider) async -> Data? {
            await withCheckedContinuation { continuation in
                provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                    continuation.resume(returning: data)
                }
            }
        }

        private func temporaryImageURL(data: Data, fileExtension: String) -> URL? {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("manwon-upload-\(UUID().uuidString)")
                .appendingPathExtension(fileExtension)
            do {
                try data.write(to: url, options: .atomic)
                return url
            } catch {
                return nil
            }
        }

        private func finishFilePicker(with urls: [URL]?) {
            let completion = filePickerCompletion
            filePickerCompletion = nil
            completion?(urls)
        }

        private func topViewController() -> UIViewController? {
            let windowScenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let root = windowScenes
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)?
                .rootViewController

            var top = root
            while let presented = top?.presentedViewController {
                top = presented
            }
            return top
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            onStartLoading()
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            onFinishLoading()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if let url = webView.url {
                let path = AppConfig.pathWithQuery(from: url)
                currentPath = path
                requestedPath = path
                onRouteChange(path)
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
            if isNativeRoute(targetURL.path) && routePath != currentPath {
                onNativeRoute(routePath)
                decisionHandler(.cancel)
                return
            }

            currentPath = routePath
            requestedPath = routePath
            onRouteChange(routePath)
            decisionHandler(.allow)
        }

        private func handle(_ error: Error) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }
            guard !(nsError.domain == "WebKitErrorDomain" && nsError.code == 102) else { return }
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
        style.textContent = '.bottom-nav{display:none!important}.app-shell{max-width:100%!important;box-shadow:none!important}.screen{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}.profile-flow-page{padding-bottom:calc(148px + env(safe-area-inset-bottom))!important}.auth-shell .screen{padding-bottom:calc(20px + env(safe-area-inset-bottom))!important}';
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
      var overlayWatch = {
        lastIsPresented: null,
        frame: 0
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
      function hasBlockingOverlay() {
        return Boolean(document.querySelector('.sheet-overlay, .modal-overlay, .selection-overlay, .profile-photo-viewer-overlay, .profile-extra-modal-overlay'));
      }
      function postOverlayState(isPresented) {
        if (overlayWatch.lastIsPresented === isPresented) return;
        overlayWatch.lastIsPresented = isPresented;
        try {
          window.webkit.messageHandlers.manwonNative.postMessage({
            type: 'overlayState',
            isPresented: isPresented
          });
        } catch (error) {}
      }
      function readOverlayState() {
        postOverlayState(hasBlockingOverlay());
      }
      function scheduleOverlayState() {
        if (overlayWatch.frame) return;
        overlayWatch.frame = window.requestAnimationFrame(function() {
          overlayWatch.frame = 0;
          readOverlayState();
        });
      }
      function postNativeRoute(rawUrl) {
        try {
          var target = new URL(rawUrl, window.location.origin);
          if (target.pathname + target.search === window.location.pathname + window.location.search) return false;
          if (!shouldNativeRoute(target.pathname)) return false;
          window.webkit.messageHandlers.manwonNative.postMessage({ type: 'route', path: target.pathname + target.search });
          return true;
        } catch (error) {
          return false;
        }
      }
      postWebRoute();
      scheduleOverlayState();
      var originalPushState = history.pushState;
      history.pushState = function(state, title, url) {
        if (url && postNativeRoute(url)) return;
        var result = originalPushState.apply(this, arguments);
        postWebRoute(url);
        setTimeout(bindHomeScroller, 0);
        setTimeout(scheduleOverlayState, 0);
        return result;
      };
      var originalReplaceState = history.replaceState;
      history.replaceState = function(state, title, url) {
        if (url && postNativeRoute(url)) return;
        var result = originalReplaceState.apply(this, arguments);
        postWebRoute(url);
        setTimeout(bindHomeScroller, 0);
        setTimeout(scheduleOverlayState, 0);
        return result;
      };
      window.addEventListener('popstate', function() {
        setTimeout(function() {
          postWebRoute();
          bindHomeScroller();
          scheduleOverlayState();
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
        scrollWatch.observer = new MutationObserver(function() {
          bindHomeScroller();
          scheduleOverlayState();
        });
        scrollWatch.observer.observe(document.body, { childList: true, subtree: true });
      }
      bindHomeScroller();
      scheduleOverlayState();
    })();
    """
}
