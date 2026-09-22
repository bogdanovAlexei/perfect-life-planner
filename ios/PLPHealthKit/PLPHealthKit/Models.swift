import Foundation

struct StoredSession: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let userID: String
    let expiresAt: Date

    var isExpiredSoon: Bool {
        expiresAt <= Date().addingTimeInterval(60)
    }
}

struct DailyHealthMetrics: Codable, Sendable {
    let steps: Double?
    let sleepMinutes: Double?
    let activeCaloriesKcal: Double?
    let restingHeartRateBpm: Double?
    let workoutCount: Int?

    var isEmpty: Bool {
        steps == nil &&
            sleepMinutes == nil &&
            activeCaloriesKcal == nil &&
            restingHeartRateBpm == nil &&
            workoutCount == nil
    }
}

struct DailyHealthSummaryPayload: Encodable, Sendable {
    let userID: String
    let observedOn: String
    let source: String
    let sourceRecordKey: String
    let timezone: String
    let capturedAt: String
    let metricsVersion: Int
    let metrics: DailyHealthMetrics
    let provenance: HealthProvenance
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case observedOn = "observed_on"
        case source
        case sourceRecordKey = "source_record_key"
        case timezone
        case capturedAt = "captured_at"
        case metricsVersion = "metrics_version"
        case metrics
        case provenance
        case updatedAt = "updated_at"
    }
}

struct HealthProvenance: Encodable, Sendable {
    let garminConnectSharedToHealth: Bool
    let completeness: String

    enum CodingKeys: String, CodingKey {
        case garminConnectSharedToHealth = "garmin_connect_shared_to_health"
        case completeness
    }
}

struct AuthResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: AuthUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }
}

struct AuthUser: Decodable, Sendable {
    let id: String
    let email: String?
}
