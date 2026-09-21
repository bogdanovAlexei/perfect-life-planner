import SwiftUI

@main
struct PLPHealthKitApp: App {
    @StateObject private var sync = SyncCoordinator()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(sync)
        }
    }
}
