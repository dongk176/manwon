import Foundation
import AuthenticationServices
import KakaoSDKAuth
import KakaoSDKUser
import UIKit

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

struct AppleLoginResult {
    let identityToken: String
    let fullName: String?
}

enum AppleLoginError: LocalizedError {
    case inProgress
    case missingCredential
    case missingIdentityToken
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .inProgress:
            return "Apple 로그인이 이미 진행 중입니다."
        case .missingCredential:
            return "Apple 계정 정보를 확인할 수 없습니다."
        case .missingIdentityToken:
            return "Apple 인증 토큰이 비어 있습니다."
        case .failed(let message):
            return message.isEmpty ? "Apple 로그인에 실패했습니다." : message
        }
    }
}

final class AppleLoginManager: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    static let shared = AppleLoginManager()

    private var continuation: CheckedContinuation<AppleLoginResult, Error>?
    private let nameFormatter = PersonNameComponentsFormatter()

    private override init() {
        super.init()
    }

    @MainActor
    func loginWithApple() async throws -> AppleLoginResult {
        guard continuation == nil else {
            throw AppleLoginError.inProgress
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            finish(.failure(AppleLoginError.missingCredential))
            return
        }

        guard
            let identityTokenData = credential.identityToken,
            let identityToken = String(data: identityTokenData, encoding: .utf8),
            !identityToken.isEmpty
        else {
            finish(.failure(AppleLoginError.missingIdentityToken))
            return
        }

        let fullName = credential.fullName
            .map { nameFormatter.string(from: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .flatMap { $0.isEmpty ? nil : $0 }

        finish(.success(AppleLoginResult(identityToken: identityToken, fullName: fullName)))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let authorizationError = error as? ASAuthorizationError, authorizationError.code == .canceled {
            finish(.failure(AppleLoginError.failed("Apple 로그인이 취소되었습니다.")))
            return
        }

        finish(.failure(AppleLoginError.failed(error.localizedDescription)))
    }

    private func finish(_ result: Result<AppleLoginResult, Error>) {
        guard let continuation else { return }
        self.continuation = nil

        switch result {
        case .success(let loginResult):
            continuation.resume(returning: loginResult)
        case .failure(let error):
            continuation.resume(throwing: error)
        }
    }
}
