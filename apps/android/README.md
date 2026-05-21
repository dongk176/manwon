# Manwon Android

Expo/React Native 없이 만든 가벼운 네이티브 Android 셸입니다.

- 패키지: `com.manwon.app`
- 표시 이름: `뭐든해줌`
- 웹 기본 URL: `https://manwonmvp.vercel.app`
- 네이티브 범위: 하단 탭바, 채팅 목록/상세, 주변 화면
- 웹뷰 범위: 홈, 등록, 마이, 부탁 상세 등 나머지 Next.js 화면

## 열기

Android Studio에서 `apps/android` 폴더를 열면 됩니다.

실기기 테스트는 Android Studio에서 디바이스를 선택한 뒤 `Run`을 누르세요. 로컬 서버가 아니라 배포된 웹을 보도록 되어 있어서 같은 Wi-Fi나 Mac IP 설정은 필요 없습니다.

## 빌드 확인

```bash
/Users/gimdongmin/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3/bin/gradle -p apps/android assembleDebug
```

APK 출력 위치:

```text
apps/android/app/build/outputs/apk/debug/app-debug.apk
```

## Push

현재 구조는 푸시 라우팅과 토큰 등록 자리를 열어둔 상태입니다. Android FCM을 실제로 켜려면 Firebase Android SDK와 `google-services.json`을 `apps/android/app`에 붙이면 됩니다.
