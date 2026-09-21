import Foundation
import HealthKit

/// Versioned values shared by the native writer, the web reader and the SQL contract.
enum HealthSyncContract {
    static let source = "apple_health"
    static let sourceRecordKey = "apple_health_daily:v1"
    static let metricsVersion = 1
    static let provenanceCompleteness = "partial"
    static let garminConnectSharedToHealth = false
    static let initialLookbackDays = 7
    static let maximumLookbackDays = 30
    static let overlapDays = 1
    static let backgroundDeliveryFrequency: HKUpdateFrequency = .hourly
    static let lastSyncAtDefaultsKey = "plp.healthkit.last-sync-at"
    static let upsertConflictColumns = "user_id,source,source_record_key,observed_on"

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        return calendar
    }

    static func observedOn(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func capturedAt(for date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}

/// Calculates the calendar days that need to be re-read from HealthKit.
/// Keeping this pure makes the catch-up policy easy to review without a device.
struct HealthSyncWindow {
    static func dayStarts(
        now: Date,
        lastSyncAt: Date?,
        calendar: Calendar = HealthSyncContract.calendar
    ) -> [Date] {
        let maximumLowerBound = calendar.date(
            byAdding: .day,
            value: -HealthSyncContract.maximumLookbackDays,
            to: now
        ) ?? now
        let lowerBound: Date

        if let lastSyncAt {
            let overlapStart = calendar.date(
                byAdding: .day,
                value: -HealthSyncContract.overlapDays,
                to: lastSyncAt
            ) ?? lastSyncAt
            lowerBound = max(overlapStart, maximumLowerBound)
        } else {
            lowerBound = calendar.date(
                byAdding: .day,
                value: -HealthSyncContract.initialLookbackDays,
                to: now
            ) ?? now
        }

        var day = calendar.startOfDay(for: min(lowerBound, now))
        var result: [Date] = []
        while day <= now {
            result.append(day)
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else {
                break
            }
            day = nextDay
        }
        return result
    }
}
