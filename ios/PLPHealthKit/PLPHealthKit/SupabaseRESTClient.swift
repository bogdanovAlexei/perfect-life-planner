import Foundation

actor SupabaseRESTClient {
    private let configuration: AppConfiguration
    private let keychain = KeychainStore()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let session: URLSession

    private enum Key {
        static let session = "supabase-session"
    }

    private enum Endpoint {
        static let authToken = "auth/v1/token"
        static let authLogout = "auth/v1/logout"
        static let dailySummaries = "rest/v1/health_daily_summaries"
    }

    init(configuration: AppConfiguration) {
        self.configuration = configuration
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.timeoutIntervalForRequest = 30
        sessionConfiguration.timeoutIntervalForResource = 60
        sessionConfiguration.httpShouldSetCookies = false
        sessionConfiguration.urlCache = nil
        sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: sessionConfiguration)
    }

    func hasSession() -> Bool {
        (try? keychain.read(forKey: Key.session)) != nil
    }

    func sessionUserID() throws -> String {
        try storedSession().userID
    }

    func signIn(email: String, password: String) async throws -> String? {
        let url = configuration.supabaseURL
            .appendingPathComponent(Endpoint.authToken)
            .appending(queryItems: [URLQueryItem(name: "grant_type", value: "password")])
        let response: AuthResponse = try await send(
            url: url,
            method: "POST",
            body: ["email": email, "password": password],
            accessToken: nil
        )
        try persist(response)
        return response.user.email
    }

    func restoreSession() async -> Bool {
        guard let stored = try? storedSession() else {
            return false
        }

        if !stored.isExpiredSoon {
            return true
        }

        do {
            try await refresh(using: stored.refreshToken)
            return true
        } catch {
            try? keychain.delete(forKey: Key.session)
            return false
        }
    }

    func signOut() async throws {
        // Always clear the device copy, even if the network revocation fails.
        // This prevents a lost device from retaining a usable local session.
        defer { try? keychain.delete(forKey: Key.session) }

        guard (try? storedSession()) != nil else { return }
        let session = try await validSession()
        var request = URLRequest(
            url: configuration.supabaseURL.appendingPathComponent(Endpoint.authLogout)
        )
        request.httpMethod = "POST"
        request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
    }

    func upsert(_ payloads: [DailyHealthSummaryPayload]) async throws {
        guard !payloads.isEmpty else { return }
        let session = try await validSession()
        let url = configuration.supabaseURL
            .appendingPathComponent(Endpoint.dailySummaries)
            .appending(queryItems: [URLQueryItem(name: "on_conflict", value: HealthSyncContract.upsertConflictColumns)])

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(payloads)
        request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")

        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
    }

    private func validSession() async throws -> StoredSession {
        let session = try storedSession()

        if session.isExpiredSoon {
            return try await refresh(using: session.refreshToken)
        }
        return session
    }

    private func storedSession() throws -> StoredSession {
        guard let raw = try? keychain.read(forKey: Key.session),
              let data = raw.data(using: .utf8),
              let session = try? decoder.decode(StoredSession.self, from: data)
        else {
            throw SupabaseClientError.notAuthenticated
        }
        return session
    }

    @discardableResult
    private func refresh(using refreshToken: String) async throws -> StoredSession {
        let url = configuration.supabaseURL
            .appendingPathComponent(Endpoint.authToken)
            .appending(queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")])
        let response: AuthResponse = try await send(
            url: url,
            method: "POST",
            body: ["refresh_token": refreshToken],
            accessToken: nil
        )
        try persist(response)
        return try decodeStoredSession(response)
    }

    private func persist(_ response: AuthResponse) throws {
        let stored = try decodeStoredSession(response)
        let data = try encoder.encode(stored)
        guard let raw = String(data: data, encoding: .utf8) else {
            throw SupabaseClientError.invalidResponse
        }
        try keychain.save(raw, forKey: Key.session)
    }

    private func decodeStoredSession(_ response: AuthResponse) throws -> StoredSession {
        StoredSession(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            userID: response.user.id,
            expiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn))
        )
    }

    private func send<T: Decodable>(
        url: URL,
        method: String,
        body: [String: String],
        accessToken: String?
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = try encoder.encode(body)
        request.setValue(configuration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
        guard data.count <= 1_048_576 else {
            throw SupabaseClientError.invalidResponse
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw SupabaseClientError.invalidResponse
        }
    }

    private func validate(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw SupabaseClientError.apiStatus(code)
        }
    }
}

enum SupabaseClientError: LocalizedError {
    case notAuthenticated
    case apiStatus(Int)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Connectez-vous pour synchroniser vos données."
        case let .apiStatus(status):
            switch status {
            case 400, 401:
                return "Identifiants invalides ou session expirée."
            case 403:
                return "Cette opération n’est pas autorisée."
            case 429:
                return "Trop de tentatives. Réessayez dans quelques minutes."
            default:
                return "Le service de synchronisation est momentanément indisponible (HTTP \(status))."
            }
        case .invalidResponse:
            return "Réponse Supabase invalide."
        }
    }
}
