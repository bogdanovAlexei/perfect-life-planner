# Architecture de Perfect Life Planner

La version publiée est une application statique : `dist/index.html` ne contient plus que la structure HTML et charge les ressources dédiées.

## Organisation

- `dist/css/app.css` : styles responsives communs.
- `dist/js/config.js` : configuration publique du client Supabase.
- `dist/js/features/planner-ui.js` : création, masquage et édition des plages.
- `dist/js/features/planner-grid.js` : grille 24 heures et rendu des événements.
- `dist/js/features/schedule-ocr.js` : import d’image et reconnaissance de l’emploi du temps.
- `dist/js/features/health-dashboard.js` : état local, affichage et cartes santé.
- `dist/js/features/garmin-parsers.js` : lecture locale des exports Garmin FIT, CSV, JSON et ZIP.
- `dist/js/features/health-sync.js` : conversion et synchronisation privée Supabase.
- `dist/js/features/health.js` : orchestration des boutons d’import, démonstration et effacement.
- `dist/js/features/auth.js` : inscription, connexion et session Supabase.
- `supabase/migrations/` : structure de base de données versionnée.
- `tests/fixtures/` : jeux de données non personnels pour les vérifications.

## Ajouter une fonctionnalité

Créer un fichier dans `dist/js/features/` pour chaque domaine métier, puis l’ajouter dans `dist/index.html` avec `defer`. Les scripts sont exécutés dans leur ordre de déclaration : les dépendances partagées doivent donc être chargées avant le module qui les utilise.

## Tester localement

Lancer `node plp-preview.mjs`, puis ouvrir `http://127.0.0.1:4173`.

Pour les cartes Garmin, le bouton **Tester la démo** charge des métriques fictives sans transmettre de données. Le fichier `tests/fixtures/garmin-health-sample.csv` permet aussi de tester l’import CSV.
