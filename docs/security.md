# Sécurité de Perfect Life Planner

## Frontend web

- Les seules clés embarquées sont les clés Supabase publiables. Elles ne donnent aucun privilège sans les politiques RLS.
- Les bibliothèques chargées depuis jsDelivr sont épinglées à une version exacte et vérifiées par Subresource Integrity.
- La Content Security Policy limite les scripts, connexions, images et workers aux origines nécessaires.
- Les imports photo et santé ont des limites de taille, de nombre d’entrées et de taille décompressée.
- Les valeurs utilisateur affichées dans le planning sont échappées avant d’être injectées dans le DOM.

## Supabase

- Les tables santé ont RLS activé et ne sont accessibles qu’au propriétaire authentifié de chaque ligne.
- Le rôle `anon` n’a aucun droit direct sur les tables santé.
- Des contraintes SQL limitent les tailles JSON et rejettent les mesures physiologiquement impossibles.
- La clé `service_role` et les clés secrètes ne doivent jamais être présentes dans le navigateur, l’app iOS ou GitHub.

## iPhone

- Les jetons de session sont conservés dans le trousseau iOS et supprimés localement lors de la déconnexion.
- Le client réseau refuse les URL Supabase non HTTPS, désactive les cookies et le cache, et borne ses délais et réponses.
- Les messages bruts renvoyés par l’API ne sont pas affichés à l’utilisateur.

## Vérifications avant publication

1. Lancer `node --check` sur les fichiers JavaScript de `dist`.
2. Lancer les contrats dans `tests/*.mjs`.
3. Lancer `npm audit` si le scaffold npm est utilisé.
4. Vérifier les advisors Supabase Security et Performance après chaque migration.
5. Rechercher les clés secrètes et les API dangereuses avant le commit.
