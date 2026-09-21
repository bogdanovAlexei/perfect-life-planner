import Foundation
import HealthKit

/// Versioned values shared by the native writer, the web reader and the SQL contract.
enum HealthSyncContract {
    static let source = "apple_health"
    static let sourceRecordKey = "apple_health_daily:v1"
    static let metricsVersion = 1
    static let provenanceCompleteness = "partial"
    static let garminConnectSharedToHealth = false
    static let initialDayCount = 7
    static let maximumDayCount = 30
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
        let today = calendar.startOfDay(for: now)
        let maximumLowerBound = calendar.date(
            byAdding: .day,
            value: -(HealthSyncContract.maximumDayCount - 1),
            to: today
        ) ?? today
        let lowerBound: Date

        if let lastSyncAt {
            let lastSyncDay = calendar.startOfDay(for: lastSyncAt)
            let overlapStart = calendar.date(
                byAdding: .day,
                value: -HealthSyncContract.overlapDays,
                to: lastSyncDay
            ) ?? lastSyncDay
            lowerBound = max(overlapStart, maximumLowerBound)
        } else {
            lowerBound = calendar.date(
                byAdding: .day,
                value: -(HealthSyncContract.initialDayCount - 1),
                to: today
            ) ?? today
        }

        var day = calendar.startOfDay(for: min(lowerBound, today))
        var result: [Date] = []
        while day <= today && result.count < HealthSyncContract.maximumDayCount {
            result.append(day)
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else {
                break
            }
            day = nextDay
        }
        return result
    }
}
