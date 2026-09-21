# Contrat HealthKit v1 pour PLP

Ce contrat prépare le futur compagnon iPhone PLP. Il ne constitue pas encore une app iOS : la web app ne peut pas demander directement l'autorisation HealthKit.

## Flux prévu

Garmin Connect synchronise les données compatibles vers Apple Santé. Le compagnon iOS lit les agrégats autorisés, effectue un rattrapage depuis la dernière synchronisation connue, puis réalise un `upsert` dans `health_daily_summaries` avec la session Supabase de l'utilisateur.

La contrainte unique `(user_id, source, source_record_key, observed_on)` rend les retries idempotents. Aucun échantillon brut, identifiant de montre ou secret Garmin ne doit être envoyé par ce contrat.

## Payload v1

```json
{
  "observed_on": "2026-09-21",
  "source": "apple_health",
  "source_record_key": "apple_health_daily:v1",
  "timezone": "Europe/Paris",
  "captured_at": "2026-09-21T20:15:00Z",
  "metrics_version": 1,
  "metrics": {
    "steps": 7421,
    "sleep_minutes": 418,
    "active_calories_kcal": 511,
    "resting_heart_rate_bpm": 52,
    "workout_count": 1
  },
  "provenance": {
    "garmin_connect_shared_to_health": true,
    "completeness": "partial"
  }
}
```

La version 1 limite volontairement les métriques à `steps`, `sleep_minutes`, `active_calories_kcal`, `resting_heart_rate_bpm` et `workout_count`. Les traces GPS, les séries de fréquence cardiaque, le stress, la VFC et Body Battery restent des données FIT ou Garmin Health API tant qu'elles ne sont pas réellement disponibles dans Apple Santé.

## Règles de sécurité

- l'utilisateur doit être authentifié Supabase ;
- le compagnon utilise uniquement la clé publishable et la session de l'utilisateur ;
- aucune clé `service_role`, clé secrète ou identifiant Garmin n'est embarqué dans l'app ;
- les autorisations HealthKit sont demandées type par type et peuvent être révoquées ;
- la provenance et la complétude sont affichées pour éviter de présenter une donnée partielle comme une mesure Garmin complète.

## Vérification iPhone à venir

Activer Garmin Connect → Apple Santé, autoriser trois types minimum (pas, sommeil, activité), synchroniser la montre au premier plan, puis vérifier le rattrapage sur 24 à 72 heures. Comparer une activité au fichier FIT : l'absence attendue du GPS et des séries détaillées doit rester visible.
