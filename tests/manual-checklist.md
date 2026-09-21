# Vérifications manuelles PLP

1. Lancer `node plp-preview.mjs`.
2. Ouvrir `http://127.0.0.1:4173` sur ordinateur puis avec une largeur mobile.
3. Cliquer sur **Tester la démo** : les cinq cartes santé doivent être renseignées.
4. Cliquer sur **Effacer** : les cartes doivent revenir à leur état vide.
5. Importer `tests/fixtures/garmin-health-sample.csv` : les mêmes cartes doivent être mises à jour.
6. Ajouter une plage, la rendre fixe ou flexible, puis vérifier son rendu dans la grille 24 heures.
7. Cliquer sur une plage de la grille et vérifier l’ajout d’une description.
8. Vérifier l’inscription et la connexion ; après connexion, importer Garmin puis recharger la page.
