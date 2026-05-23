import Foundation
import KakaoSDKAuth
import KakaoSDKUser

enum KakaoLoginError: LocalizedError {
    case missingNativeAppKey
    case kakaoTalkUnavailable
    case missingAccessToken
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .missingNativeAppKey:
            return "카카오 Native App Key가 설정되어 있지 않습니다."
        case .kakaoTalkUnavailable:
            return "카카오톡 설치 후 다시 시도해주세요."
        case .missingAccessToken:
            return "카카오 인증 토큰이 비어 있습니다."
        case .failed(let message):
            return message.isEmpty ? "카카오 로그인에 실패했습니다." : message
        }
    }
}

final class KakaoLoginManager {
    static let shared = KakaoLoginManager()

    private init() {}

    @MainActor
    func handleOpenURL(_ url: URL) -> Bool {
        guard AuthApi.isKakaoTalkLoginUrl(url) else { return false }
        _ = AuthController.handleOpenUrl(url: url)
        return true
    }

    @MainActor
    func loginWithKakaoTalk() async throws -> String {
        guard AppConfig.kakaoNativeAppKey != nil else {
            throw KakaoLoginError.missingNativeAppKey
        }
        guard UserApi.isKakaoTalkLoginAvailable() else {
            throw KakaoLoginError.kakaoTalkUnavailable
        }

        return try await withCheckedThrowingContinuation { continuation in
            UserApi.shared.loginWithKakaoTalk { oauthToken, error in
                if let error {
                    continuation.resume(throwing: KakaoLoginError.failed(error.localizedDescription))
                    return
                }

                guard let accessToken = oauthToken?.accessToken, !accessToken.isEmpty else {
                    continuation.resume(throwing: KakaoLoginError.missingAccessToken)
                    return
                }

                continuation.resume(returning: accessToken)
            }
        }
    }
}
