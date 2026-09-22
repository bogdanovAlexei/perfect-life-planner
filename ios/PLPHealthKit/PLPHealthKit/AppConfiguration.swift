import Foundation

struct AppConfiguration {
    let supabaseURL: URL
    let supabasePublishableKey: String

    init(bundle: Bundle = .main) throws {
        guard
            let urlString = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: urlString),
            url.scheme == "https",
            url.user == nil,
            url.password == nil,
            url.query == nil,
            url.fragment == nil,
            url.host?.hasSuffix(".supabase.co") == true,
            !urlString.contains("YOUR_PROJECT_REF")
        else {
            throw ConfigurationError.missing("SUPABASE_URL")
        }

        guard
            let key = bundle.object(forInfoDictionaryKey: "SUPABASE_PUBLISHABLE_KEY") as? String,
            key.hasPrefix("sb_publishable_"),
            !key.contains("REPLACE_ME")
        else {
            throw ConfigurationError.missing("SUPABASE_PUBLISHABLE_KEY")
        }

        supabaseURL = url
        supabasePublishableKey = key
    }
}

enum ConfigurationError: LocalizedError {
    case missing(String)

    var errorDescription: String? {
        switch self {
        case let .missing(key):
            return "La configuration \(key) est absente. Ouvrez le fichier Config/PLPHealthKit.xcconfig."
        }
    }
}
