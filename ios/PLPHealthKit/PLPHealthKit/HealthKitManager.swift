import Foundation
import HealthKit

final class HealthKitManager: @unchecked Sendable {
    private let store = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []
    private var observersStarted = false

    private var stepType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .stepCount)
    }

    private var activeEnergyType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
    }

    private var restingHeartRateType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .restingHeartRate)
    }

    private var sleepType: HKCategoryType? {
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    }

    private var workoutType: HKWorkoutType {
        HKObjectType.workoutType()
    }

    private var readTypes: Set<HKObjectType> {
        var result = Set<HKObjectType>()
        if let stepType { result.insert(stepType) }
        if let activeEnergyType { result.insert(activeEnergyType) }
        if let restingHeartRateType { result.insert(restingHeartRateType) }
        if let sleepType { result.insert(sleepType) }
        result.insert(workoutType)
        return result
    }

    private var backgroundTypes: [HKObjectType] {
        readTypes.filter { $0 is HKSampleType }
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitError.unavailable
        }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func enableBackgroundDelivery() async throws {
        for type in backgroundTypes {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                store.enableBackgroundDelivery(
                    for: type,
                    frequency: HealthSyncContract.backgroundDeliveryFrequency
                ) { success, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else if success {
                        continuation.resume()
                    } else {
                        continuation.resume(throwing: HealthKitError.backgroundDeliveryDenied)
                    }
                }
            }
        }
    }

    func startBackgroundMonitoring(onChange: @escaping @Sendable () async -> Void) {
        guard !observersStarted, HKHealthStore.isHealthDataAvailable() else { return }
        observersStarted = true

        for type in backgroundTypes {
            guard let sampleType = type as? HKSampleType else { continue }
            let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { _, completion, _ in
                Task {
                    await onChange()
                    completion()
                }
            }
            observerQueries.append(query)
            store.execute(query)
        }
    }

    func dailyMetrics(from start: Date, to end: Date) async throws -> DailyHealthMetrics {
        async let steps = sum(for: stepType, from: start, to: end, unit: .count())
        async let calories = sum(for: activeEnergyType, from: start, to: end, unit: .kilocalorie())
        async let restingHeartRate = average(for: restingHeartRateType, from: start, to: end, unit: HKUnit.count().unitDivided(by: HKUnit.minute()))
        async let sleep = sleepMinutes(from: start, to: end)
        async let workouts = workoutCount(from: start, to: end)

        return DailyHealthMetrics(
            steps: try await steps,
            sleepMinutes: try await sleep,
            activeCaloriesKcal: try await calories,
            restingHeartRateBpm: try await restingHeartRate,
            workoutCount: try await workouts
        )
    }

    private func sum(
        for type: HKQuantityType?,
        from start: Date,
        to end: Date,
        unit: HKUnit
    ) async throws -> Double? {
        guard let type else { return nil }
        return try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: unit))
                }
            }
            store.execute(query)
        }
    }

    private func average(
        for type: HKQuantityType?,
        from start: Date,
        to end: Date,
        unit: HKUnit
    ) async throws -> Double? {
        guard let type else { return nil }
        return try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: statistics?.averageQuantity()?.doubleValue(for: unit))
                }
            }
            store.execute(query)
        }
    }

    private func sleepMinutes(from start: Date, to end: Date) async throws -> Double? {
        guard let sleepType else { return nil }
        return try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let total = (samples as? [HKCategorySample] ?? []).reduce(0.0) { partial, sample in
                    guard self.isAsleep(sample) else { return partial }
                    let overlapStart = max(start, sample.startDate)
                    let overlapEnd = min(end, sample.endDate)
                    return partial + max(0, overlapEnd.timeIntervalSince(overlapStart))
                }
                continuation.resume(returning: total > 0 ? total / 60 : nil)
            }
            store.execute(query)
        }
    }

    private func workoutCount(from start: Date, to end: Date) async throws -> Int? {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
            let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    let count = samples?.count ?? 0
                    continuation.resume(returning: count > 0 ? count : nil)
                }
            }
            store.execute(query)
        }
    }

    private func isAsleep(_ sample: HKCategorySample) -> Bool {
        sample.value != HKCategoryValueSleepAnalysis.inBed.rawValue &&
            sample.value != HKCategoryValueSleepAnalysis.awake.rawValue
    }
}

enum HealthKitError: LocalizedError {
    case unavailable
    case backgroundDeliveryDenied

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "HealthKit n’est pas disponible sur cet appareil."
        case .backgroundDeliveryDenied:
            return "La livraison en arrière-plan HealthKit a été refusée. Vérifiez la capacité HealthKit dans Xcode."
        }
    }
}
