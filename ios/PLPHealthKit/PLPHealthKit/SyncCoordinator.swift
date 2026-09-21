import Foundation
import SwiftUI

@MainActor
final class SyncCoordinator: ObservableObject {
    enum Status: Equatable {
        case signedOut
        case ready
        case requestingAccess
        case syncing
        case synced
        case failed
    }

    @Published private(set) var status: Status = .signedOut
    @Published private(set) var statusMessage = "Connectez-vous pour commencer."
    @Published private(set) var isAuthenticated = false
    @Published private(set) var accountEmail: String?
    @Published private(set) var lastSyncAt: Date?

    private let healthKit: HealthKitManager
    private let supabase: SupabaseRESTClient?
    private let configurationError: Error?
    private let defaults = UserDefaults.standard
    private var monitoringInstalled = false

    init() {
        healthKit = HealthKitManager()
        do {
            let configuration = try AppConfiguration()
            supabase = SupabaseRESTClient(configuration: configuration)
            configurationError = nil
        } catch {
            supabase = nil
            configurationError = error
        }
        installBackgroundMonitoring()

        Task { [weak self] in
            await self?.restoreSession()
        }
    }

    func installBackgroundMonitoring() {
        guard !monitoringInstalled else { return }
        monitoringInstalled = true
        healthKit.startBackgroundMonitoring { [weak self] in
            await self?.syncInBackground()
        }
    }

    func signIn(email: String, password: String) async {
        guard let supabase else {
            status = .failed
            statusMessage = configurationError?.localizedDescription ?? "Configuration Supabase absente."
            return
        }

        status = .syncing
        statusMessage = "Connexion sécurisée…"
        do {
            accountEmail = try await supabase.signIn(email: email, password: password)
            let userID = try await supabase.sessionUserID()
            lastSyncAt = loadLastSyncAt(for: userID)
            isAuthenticated = true
            status = .ready
            statusMessage = "Compte connecté. Autorisez Apple Santé pour activer la synchronisation."
        } catch {
            status = .failed
            statusMessage = error.localizedDescription
        }
    }

    func signOut() async {
        isAuthenticated = false
        accountEmail = nil
        lastSyncAt = nil

        do {
            try await supabase?.signOut()
            status = .signedOut
            statusMessage = "Connectez-vous pour commencer."
        } catch {
            status = .failed
            statusMessage = "Session locale supprimée, mais la révocation Supabase a échoué : \(error.localizedDescription)"
        }
    }

    func authorizeAndSync() async {
        guard isAuthenticated else {
            status = .failed
            statusMessage = "Connectez-vous avant d’autoriser Apple Santé."
            return
        }

        status = .requestingAccess
        statusMessage = "Autorisation Apple Santé…"
        do {
            try await healthKit.requestAuthorization()
            try await healthKit.enableBackgroundDelivery()
            statusMessage = "Apple Santé autorisée. Synchronisation initiale…"
            try await syncDays()
        } catch {
            status = .failed
            statusMessage = error.localizedDescription
        }
    }

    func syncNow() async {
        do {
            try await syncDays()
        } catch {
            status = .failed
            statusMessage = error.localizedDescription
        }
    }

    private func restoreSession() async {
        guard let supabase, await supabase.restoreSession() else { return }
        if let userID = try? await supabase.sessionUserID() {
            lastSyncAt = loadLastSyncAt(for: userID)
        }
        isAuthenticated = true
        status = .ready
        statusMessage = "Session restaurée. Apple Santé se synchronisera en arrière-plan après autorisation."
    }

    private func syncInBackground() async {
        guard isAuthenticated, let supabase, await supabase.hasSession() else { return }
        do {
            try await syncDays()
        } catch {
            // Background delivery must return quickly. The next HealthKit event retries the catch-up window.
        }
    }

    private func syncDays() async throws {
        guard let supabase else {
            throw configurationError ?? ConfigurationError.missing("Supabase")
        }
        let userID = try await supabase.sessionUserID()
        let userLastSyncAt = loadLastSyncAt(for: userID)
        lastSyncAt = userLastSyncAt
        status = .syncing
        statusMessage = "Lecture des agrégats Apple Santé…"

        let now = Date()
        var payloads: [DailyHealthSummaryPayload] = []
        let capturedAt = HealthSyncContract.capturedAt(for: now)
        let calendar = HealthSyncContract.calendar
        for day in HealthSyncWindow.dayStarts(now: now, lastSyncAt: userLastSyncAt, calendar: calendar) {
            guard let end = calendar.date(byAdding: .day, value: 1, to: day) else { continue }
            let metrics = try await healthKit.dailyMetrics(from: day, to: min(end, now))
            if !metrics.isEmpty {
                payloads.append(
                    DailyHealthSummaryPayload(
                        userID: userID,
                        observedOn: HealthSyncContract.observedOn(for: day),
                        source: HealthSyncContract.source,
                        sourceRecordKey: HealthSyncContract.sourceRecordKey,
                        timezone: calendar.timeZone.identifier,
                        capturedAt: capturedAt,
                        metricsVersion: HealthSyncContract.metricsVersion,
                        metrics: metrics,
                        provenance: HealthProvenance(
                            garminConnectSharedToHealth: HealthSyncContract.garminConnectSharedToHealth,
                            completeness: HealthSyncContract.provenanceCompleteness
                        ),
                        updatedAt: capturedAt
                    )
                )
            }
        }

        try await supabase.upsert(payloads)
        lastSyncAt = now
        defaults.set(now, forKey: lastSyncKey(for: userID))
        status = .synced
        statusMessage = payloads.isEmpty
            ? "Apple Santé autorisée, mais aucun agrégat disponible sur la période."
            : "\(payloads.count) journée(s) synchronisée(s) automatiquement."
    }

    private func lastSyncKey(for userID: String) -> String {
        "\(HealthSyncContract.lastSyncAtDefaultsKey).\(userID)"
    }

    private func loadLastSyncAt(for userID: String) -> Date? {
        defaults.object(forKey: lastSyncKey(for: userID)) as? Date
    }

}
