# Manwon iOS

Lightweight SwiftUI iOS shell for the Next.js app.

## Structure

- Web tabs use `WKWebView` and load the existing Next.js routes.
- Chat and Nearby are native SwiftUI screens.
- The native tab bar owns the primary navigation, so the web bottom nav is hidden inside the iOS shell.

## Local Run

1. Start the web app:

```bash
pnpm dev
```

2. Open `apps/ios/Manwon.xcodeproj` in Xcode.
3. Run the `Manwon` scheme on an iPhone simulator.

The default web base URL is `https://manwonmvp.vercel.app`. Change `ManwonWebBaseURL` in `Manwon/Info.plist` for local, staging, or production builds.

Kakao native login reads `KAKAO_NATIVE_APP_KEY` from the iOS build settings. The same key is used for `KakaoNativeAppKey` and the `kakao$(KAKAO_NATIVE_APP_KEY)` URL scheme in `Info.plist`.

## Push

The project is wired for Firebase Messaging through Swift Package Manager. To enable push in a real build:

- Add `GoogleService-Info.plist` to the `Manwon` target in Xcode.
- Enable Push Notifications and Background Modes in the app identifier.
- Keep the bundle id as `com.manwon.app`, unless the server/Firebase app is updated too.

If Firebase config is missing, the app still runs and simply skips FCM token registration.
