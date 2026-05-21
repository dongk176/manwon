import Foundation

enum AppConfig {
    static let webBaseURL: URL = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "ManwonWebBaseURL") as? String
        let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: value?.isEmpty == false ? value! : "https://manwonmvp.vercel.app")!
    }()

    static func webURL(path: String) -> URL {
        if let absoluteURL = URL(string: path), absoluteURL.scheme != nil {
            return absoluteURL
        }

        let normalized = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: normalized, relativeTo: webBaseURL)!.absoluteURL
    }

    static func pathWithQuery(from url: URL) -> String {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.scheme = nil
        components?.host = nil
        components?.port = nil
        return components?.string.flatMap { $0.isEmpty ? nil : $0 } ?? url.path
    }
}
