# PLP — Intégration santé Garmin Connect

## Objectif

Transformer la zone supérieure de Perfect Life Planner en tableau de bord santé personnel, alimenté par les données autorisées du compte Garmin Connect de chaque utilisateur.

## Données ciblées

- sommeil et qualité du sommeil ;
- pas, distance et objectif quotidien ;
- calories actives et totales ;
- fréquence cardiaque et fréquence cardiaque au repos ;
- stress, respiration, Body Battery et oxymétrie lorsqu'ils sont disponibles ;
- VFC / HRV lorsqu'elle est fournie par le flux autorisé pour l'appareil ;
- minutes d'intensité ;
- activités sportives enregistrées, avec durée, distance, calories et type d'activité ;
- date de dernière synchronisation et provenance Garmin.

## APIs Garmin prévues

- **Health API** pour les mesures quotidiennes, le sommeil, les pas, les calories, le cœur et le stress.
- **Activity API** pour les séances sportives détaillées.
- **OAuth 2.0** pour obtenir le consentement explicite de l'utilisateur.

L'intégration doit utiliser le Garmin Connect Developer Program officiel. Aucune connexion par mot de passe Garmin ni API non officielle ne sera ajoutée.

## Architecture prévue

1. Le bouton « Connecter Garmin » ouvre le parcours OAuth 2.0.
2. Une Supabase Edge Function traite le retour OAuth et les notifications Garmin.
3. Les jetons Garmin restent côté serveur, dans un stockage privé chiffré, jamais dans le navigateur.
4. Les données normalisées sont enregistrées dans Supabase avec une politique RLS par utilisateur.
5. Le tableau de bord lit les derniers résumés santé et affiche clairement la date de synchronisation.

## Tables envisagées

- `garmin_connections` : état de connexion et informations de synchronisation ;
- `health_daily_summaries` : pas, objectifs, calories, stress, Body Battery et indicateurs quotidiens ;
- `sleep_summaries` : horaires, durée et phases de sommeil ;
- `heart_rate_samples` : fréquence cardiaque et repos ;
- `hrv_summaries` : VFC disponible ;
- `activities` : activités sportives Garmin ;
- `garmin_sync_events` : suivi idempotent des imports et erreurs.

Chaque table exposée à l'application devra activer RLS et limiter la lecture et l'écriture à `auth.uid() = user_id`.

## Première version de l'interface

La zone supérieure affichera en priorité :

- sommeil de la nuit ;
- pas du jour et progression vers l'objectif ;
- état de récupération combinant VFC, stress et fréquence cardiaque au repos ;
- calories brûlées ;
- dernière activité ;
- statut Garmin et dernière synchronisation.

En l'absence de connexion ou de données, l'interface doit afficher un état explicite, sans inventer de valeurs.

## Prérequis bloquant

Le projet doit être accepté dans le Garmin Connect Developer Program avant de recevoir les identifiants OAuth 2.0 et l'accès à l'environnement d'évaluation. Les identifiants seront ensuite configurés comme secrets Supabase, jamais ajoutés au dépôt Git.

## Références officielles

- https://developer.garmin.com/gc-developer-program/
- https://developer.garmin.com/gc-developer-program/health-api/
- https://developer.garmin.com/gc-developer-program/program-faq/
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/database/secure-data
