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

## Voies compatibles avec un projet personnel

- **Import d'exports Garmin** : PLP acceptera les fichiers exportés depuis Garmin Connect, notamment les fichiers `.FIT`, `.CSV` et les archives de données personnelles. L'export de bien-être Garmin peut contenir les pas, le sommeil, le stress et la VFC.
- **Apple Santé sur iPhone** : Garmin Connect peut partager avec Apple Santé les pas, le sommeil, la fréquence cardiaque, l'énergie, la distance et les entraînements compatibles. Cette voie nécessitera une couche iOS/HealthKit, car une simple page web ne peut pas lire directement Apple Santé.
- **Garmin Health API / Activity API** : conservées comme option future si le projet évolue vers un usage professionnel et obtient l'approbation Garmin.

Le MVP personnel ne demandera jamais le mot de passe Garmin et ne reposera pas sur une API non officielle. L'import de fichiers sera explicite et contrôlé par l'utilisateur.

## Architecture prévue

1. Le bouton « Importer mes données Garmin » accepte un export `.FIT`, `.CSV` ou `.ZIP`.
2. PLP vérifie le type et la structure du fichier avant de l'analyser.
3. Les données sont normalisées en résumés santé et activités, avec la date et la provenance de chaque valeur.
4. Les données normalisées sont enregistrées dans Supabase avec une politique RLS par utilisateur.
5. Le tableau de bord lit les derniers résumés santé et affiche clairement la date de dernière importation.
6. Une future app iOS pourra ajouter la lecture Apple Santé et sa synchronisation contrôlée.

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

## Prérequis du MVP personnel

Il n'est pas nécessaire d'obtenir un accès au programme développeur Garmin pour commencer. Il faudra disposer d'un export Garmin Connect et décider si l'import se fait fichier par fichier ou via une app iOS compagnon.

L'accès au programme Garmin restera une piste ultérieure. Garmin indique que ce programme est destiné à un usage professionnel ; il ne doit donc pas être présenté comme un prérequis pour PLP personnel.

## Références officielles

- https://developer.garmin.com/gc-developer-program/
- https://developer.garmin.com/gc-developer-program/health-api/
- https://developer.garmin.com/gc-developer-program/program-faq/
- https://support.garmin.com/en-IN/?=&faq=W1TvTPW8JZ6LfJSfK512Q8
- https://support.garmin.com/fr-FR/?faq=lK5FPB9iPF5PXFkIpFlFPA&productID=125677&tab=
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/database/secure-data
