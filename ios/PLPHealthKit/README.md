# PLP Santé — compagnon iPhone HealthKit

Ce dossier contient le premier vrai compagnon natif de Perfect Life Planner. Il lit les données autorisées dans Apple Santé et synchronise des agrégats quotidiens idempotents vers `health_daily_summaries`.

## Ce qui est implémenté

- app SwiftUI iOS 17 avec capacité HealthKit et entitlement de livraison en arrière-plan ;
- demande explicite des permissions de lecture pour les pas, le sommeil, l’énergie active, la fréquence cardiaque au repos et les entraînements ;
- agrégation locale par journée calendaire et dans le fuseau de l’iPhone ;
- rattrapage sur exactement 7 jours calendaires au premier lancement, puis fenêtre de rattrapage plafonnée à 30 jours calendaires avec un jour de chevauchement ;
- observations HealthKit et livraison en arrière-plan horaire ;
- session Supabase conservée dans le trousseau iOS, jamais dans `UserDefaults` ;
- envoi REST avec la clé publishable uniquement et `upsert` sur la contrainte du contrat v1 ;
- aucune donnée brute, série cardiaque, trace GPS, clé `service_role` ou identifiant Garmin n’est envoyé.

## Ouvrir sur un Mac

1. Ouvrir `PLPHealthKit.xcodeproj` avec Xcode 16 ou plus récent.
2. Dans `Config/PLPHealthKit.xcconfig`, remplacer `PLP_DEVELOPMENT_TEAM` par le Team ID Apple. Le bundle id doit être unique si le compte Apple en impose un autre.
3. Dans le target `PLPHealthKit`, vérifier que la capability HealthKit et la livraison en arrière-plan sont bien présentes. Xcode doit signer automatiquement l’entitlement `PLPHealthKit.entitlements`.
4. Dans Signing & Capabilities, sélectionner l’équipe Apple et un iPhone réel comme destination.
5. Sur l’iPhone, activer le mode développeur, installer l’app, se connecter avec le même compte PLP que sur le site, puis appuyer sur « Autoriser Apple Santé et synchroniser ».
6. Dans Garmin Connect, activer le partage vers Apple Santé si Garmin est la source utilisée. PLP ne prétend pas que les traces GPS ou les métriques Garmin propriétaires sont disponibles via HealthKit.

Le simulateur iOS ne permet pas de valider les livraisons HealthKit en arrière-plan. Le test de référence se fait sur iPhone, écran verrouillé, après une première synchronisation au premier plan.

## Points de livraison à valider sur Mac et dans Supabase

- `PLP_DEVELOPMENT_TEAM` reste volontairement un placeholder tant qu'un Team ID Apple réel n'est pas fourni. Il doit être renseigné dans `Config/PLPHealthKit.xcconfig` sur le Mac de signature, puis la capacité HealthKit doit être vérifiée dans Signing & Capabilities.
- La livraison en arrière-plan doit être observée sur un iPhone réel : synchronisation initiale au premier plan, verrouillage, ajout d'une donnée Santé, réveil de l'app par `HKObserverQuery`, puis vérification de l'`upsert` et de la fenêtre de rattrapage.
- Dans Supabase, activer **Leaked Password Protection** dans Authentication → Password Security avant la mise en production. Cette option est une configuration Auth distante, pas une migration SQL : [documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Les fichiers de `supabase/migrations/` utilisent les versions déjà présentes à distance. Avant un prochain `supabase db push`, vérifier la liste locale/distante et ne pas recréer les anciennes versions supprimées.

## Vérification de bout en bout

- vérifier les cinq permissions dans Réglages → Santé → Apps → PLP Santé ;
- lancer une synchronisation manuelle et contrôler le statut de l’app ;
- vérifier dans Supabase qu’une ligne `apple_health` existe par jour et par utilisateur ;
- relancer l’app : la fenêtre de rattrapage doit rester idempotente ;
- importer un fichier FIT de référence dans PLP et comparer uniquement les agrégats qui existent aussi dans Apple Santé.

Le web ne peut pas demander ces permissions : c’est précisément pourquoi ce compagnon natif est nécessaire. Références : [Apple HealthKit](https://developer.apple.com/documentation/HealthKit), [observer queries](https://developer.apple.com/documentation/healthkit/executing-observer-queries) et [background delivery](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)).

## Organisation du code

- `HealthKitManager.swift` est la seule couche qui parle aux APIs HealthKit : autorisation, requêtes d'agrégats et observateurs.
- `HealthSyncContract.swift` contient les valeurs versionnées du contrat, la fenêtre de rattrapage et le format de date. Toute évolution de v1 commence ici, puis se répercute dans la migration SQL, le lecteur web et le fixture de test.
- `SyncCoordinator.swift` orchestre l'authentification, le rattrapage et l'état affiché par l'app, sans construire lui-même les URLs REST.
- `SupabaseRESTClient.swift` gère uniquement la session, le trousseau et les appels REST. Il n'embarque jamais de clé `service_role`.
- `Models.swift` décrit le payload Codable envoyé à `health_daily_summaries`.

## Règles de maintenance

1. Conserver `source_record_key` et `metrics_version` stables pour les retries et l'idempotence.
2. Ajouter une métrique uniquement si elle est réellement disponible de façon agrégée dans HealthKit ; ne pas faire passer des données Garmin propriétaires pour des données Apple Santé.
3. Garder la fenêtre de rattrapage limitée et conserver le chevauchement d'un jour pour absorber les corrections tardives.
4. Avant une livraison, lancer `node tests/healthkit-contract.mjs`, puis compiler et tester sur un iPhone réel depuis Xcode.
