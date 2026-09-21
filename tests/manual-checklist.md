# Vérifications manuelles PLP

1. Lancer `node plp-preview.mjs`.
2. Ouvrir `http://127.0.0.1:4173` sur ordinateur puis avec une largeur mobile.
3. Cliquer sur **Tester la démo** : les cinq cartes santé doivent être renseignées.
4. Cliquer sur **Effacer** : les cartes doivent revenir à leur état vide.
5. Importer `tests/fixtures/garmin-health-sample.csv` : les mêmes cartes doivent être mises à jour.
6. Ajouter une plage, la rendre fixe ou flexible, puis vérifier son rendu dans la grille 24 heures.
7. Cliquer sur une plage de la grille, ajouter une description et cocher **Important** ; le total « Créneaux protégés » doit se mettre à jour sans compter deux fois un chevauchement.
8. Cliquer sur **Masquer flexible** : seules les plages flexibles disparaissent ; les plages fixes restent affichées.
9. Utiliser les flèches au-dessus de l’EDT puis **Voir la journée** et **Voir la semaine** ; le jour choisi doit être cohérent sur mobile et ordinateur.
10. Coller ou importer une image d’emploi du temps : les créneaux doivent être ajoutés directement à la grille, sans liste ou brouillon sous l’EDT.
11. Vérifier l'inscription et la connexion ; après connexion, importer Garmin puis recharger la page.
12. Valider `tests/fixtures/healthkit-daily-summary-v1.json` contre le contrat documenté avant d'intégrer le compagnon iPhone.
13. Sur Mac, ouvrir `ios/PLPHealthKit/PLPHealthKit.xcodeproj`, sélectionner l'équipe Apple, signer l'entitlement HealthKit et installer sur un iPhone réel.
14. Autoriser les cinq types Apple Santé, lancer une synchronisation manuelle puis vérifier une ligne `apple_health` par journée dans `health_daily_summaries`.
15. Verrouiller l'iPhone, produire une nouvelle donnée compatible, puis vérifier qu'une livraison HealthKit en arrière-plan déclenche un rattrapage idempotent.
