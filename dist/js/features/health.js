(function () {
  const supportedMetrics = [
    'steps', 'stepGoal', 'sleepMinutes', 'activeCalories', 'totalCalories',
    'restingHeartRate', 'averageHeartRate', 'stressAverage', 'hrvMs', 'latestActivity',
  ];

  function safeImportMessage(error) {
    const message = String(error?.message || '');
    const expected = [
      'volumineux', 'trop de', 'Format', 'Utilisez', 'FIT', 'CSV', 'JSON', 'ZIP',
      'archive', 'métrique', 'fichier', 'endommagé', 'en-tête',
    ];
    return expected.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
      ? message
      : 'Impossible de lire ce fichier Garmin.';
  }

  healthFile.addEventListener('change', async () => {
    const file = healthFile.files?.[0];
    if (!file || healthImportBusy) return;
    healthImportBusy = true;
    healthStatus.textContent = `Lecture de ${file.name.slice(0, 120)}…`;
    try {
      const parsed = await parseHealthFile(file);
      if (!supportedMetrics.some((key) => parsed[key] !== undefined)) throw new Error('Aucune métrique santé reconnue dans ce fichier.');
      const summary = {
        ...parsed,
        sourceFileName: file.name.slice(0, 255),
        sourceFormat: window.PLPSecurity.extensionOf(file).toUpperCase(),
        importedAt: new Date().toISOString(),
      };
      paintHealth(summary);
      saveHealthLocal(summary);
      healthStatus.textContent = `${summary.sourceFileName} importé${summary.observedOn ? ` · données du ${summary.observedOn}` : ''}.`;
      await syncHealthWithSession(window.PLPAuth?.session || null, { saveCurrentImport: true });
      notice('Les cartes santé ont été mises à jour.');
    } catch (error) {
      healthStatus.textContent = safeImportMessage(error);
      notice('Import Garmin non terminé.');
    } finally {
      healthImportBusy = false;
      healthFile.value = '';
    }
  });

  healthDemo.addEventListener('click', () => {
    const summary = {
      observedOn: new Date().toISOString().slice(0, 10),
      steps: 7842,
      stepGoal: 10000,
      sleepMinutes: 438,
      activeCalories: 612,
      totalCalories: 2350,
      restingHeartRate: 54,
      averageHeartRate: 72,
      stressAverage: 28,
      hrvMs: 49,
      latestActivity: { name: 'Course du matin', type: 'Running', durationMinutes: 42, distanceKm: 7.3 },
      sourceFileName: 'Données de démonstration',
      sourceFormat: 'DÉMO',
      importedAt: new Date().toISOString(),
    };
    paintHealth(summary);
    saveHealthLocal(summary);
    healthStatus.textContent = 'Démo locale chargée : elle ne remplace pas vos données synchronisées.';
    document.getElementById('healthPrivacy').textContent = 'Données de démonstration locales · non synchronisées.';
    notice('Démo Garmin chargée.');
  });

  healthReset.addEventListener('click', async () => {
    paintHealth(null);
    saveHealthLocal(null);
    healthStatus.textContent = 'Données santé effacées sur cet appareil.';

    const session = window.PLPAuth?.session || null;
    const client = window.PLPAuth?.client || null;
    if (session?.user && client) {
      const userId = session.user.id;
      const results = await Promise.all([
        client.from('health_snapshots').delete().eq('user_id', userId),
        client.from('health_daily_summaries').delete().eq('user_id', userId),
      ]);
      if (results.some((result) => result.error)) healthStatus.textContent = 'Effacé localement, mais la suppression Supabase a échoué.';
    }

    document.getElementById('healthPrivacy').textContent = session?.user
      ? 'Connecté · aucune donnée santé enregistrée.'
      : 'Données locales tant que vous n’êtes pas connecté.';
    notice('Les données santé ont été retirées.');
  });

  try {
    const storedHealth = JSON.parse(localStorage.getItem(healthStorageKey) || 'null');
    paintHealth(storedHealth);
    if (storedHealth) healthStatus.textContent = `Dernier import : ${String(storedHealth.sourceFileName || 'Garmin').slice(0, 255)}${storedHealth.observedOn ? ` · ${storedHealth.observedOn}` : ''}.`;
  } catch {
    saveHealthLocal(null);
    paintHealth(null);
  }
}());
