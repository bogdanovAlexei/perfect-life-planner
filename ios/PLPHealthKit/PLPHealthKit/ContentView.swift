import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var sync: SyncCoordinator
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    if sync.isAuthenticated {
                        connectedView
                    } else {
                        signInView
                    }
                    statusView
                }
                .padding(24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("PLP Santé")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Votre équilibre, sans saisie manuelle")
                .font(.largeTitle.bold())
            Text("Le compagnon PLP lit uniquement les agrégats Apple Santé autorisés et les envoie dans votre espace privé.")
                .foregroundStyle(.secondary)
        }
    }

    private var signInView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connexion PLP")
                .font(.title2.bold())
            TextField("Email", text: $email)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)
            SecureField("Mot de passe", text: $password)
                .textContentType(.password)
                .textFieldStyle(.roundedBorder)
            Button {
                Task { await sync.signIn(email: email, password: password) }
            } label: {
                Label("Se connecter à PLP", systemImage: "person.crop.circle.badge.checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }

    private var connectedView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(sync.accountEmail ?? "Compte PLP connecté", systemImage: "checkmark.shield.fill")
                .foregroundStyle(.green)
            Text("Les autorisations sont demandées séparément pour les pas, le sommeil, l’énergie active, la fréquence au repos et les entraînements.")
                .foregroundStyle(.secondary)
            Button {
                Task { await sync.authorizeAndSync() }
            } label: {
                Label("Autoriser Apple Santé et synchroniser", systemImage: "heart.text.square.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Button {
                Task { await sync.syncNow() }
            } label: {
                Label("Synchroniser maintenant", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            Button("Se déconnecter") {
                Task { await sync.signOut() }
            }
            .foregroundStyle(.secondary)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }

    private var statusView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("État de la synchronisation")
                .font(.headline)
            Text(sync.statusMessage)
                .foregroundStyle(sync.status == .failed ? .red : .secondary)
            if let lastSyncAt = sync.lastSyncAt {
                Text("Dernière tentative : \(lastSyncAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }
}
