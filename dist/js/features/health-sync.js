const HEALTH_SOURCE_APPLE = 'apple_health';
const HEALTH_SOURCE_FORMAT_APPLE = 'APPLE HEALTH';
const HEALTH_APPLE_SELECT = 'observed_on,captured_at,metrics,provenance';

function healthDbRow(summary, userId) {
  return {
    user_id: userId,
    observed_on: summary.observedOn || null,
    imported_at: summary.importedAt || new Date().toISOString(),
    source_file_name: summary.sourceFileName || null,
    source_format: summary.sourceFormat || null,
    steps: summary.steps ?? null,
    step_goal: summary.stepGoal ?? null,
    sleep_minutes: summary.sleepMinutes ?? null,
    active_calories: summary.activeCalories ?? null,
    total_calories: summary.totalCalories ?? null,
    resting_heart_rate: summary.restingHeartRate ?? null,
    average_heart_rate: summary.averageHeartRate ?? null,
    stress_average: summary.stressAverage ?? null,
    hrv_ms: summary.hrvMs ?? null,
    latest_activity: summary.latestActivity || null,
    raw_summary: summary,
  };
}

function healthFromDb(row) {
  if (!row) return null;

  return {
    ...(row.raw_summary || {}),
    observedOn: row.observed_on,
    importedAt: row.imported_at,
    sourceFileName: row.source_file_name,
    sourceFormat: row.source_format,
    steps: row.steps,
    stepGoal: row.step_goal,
    sleepMinutes: row.sleep_minutes,
    activeCalories: row.active_calories,
    totalCalories: row.total_calories,
    restingHeartRate: row.resting_heart_rate,
    averageHeartRate: row.average_heart_rate,
    stressAverage: row.stress_average,
    hrvMs: row.hrv_ms,
    latestActivity: row.latest_activity,
  };
}

function appleHealthFromDb(row) {
  if (!row) return null;

  const metrics = row.metrics || {};
  const workoutCount = metrics.workout_count ?? null;

  return {
    observedOn: row.observed_on,
    importedAt: row.captured_at,
    sourceFileName: 'Apple Santé',
    sourceFormat: HEALTH_SOURCE_FORMAT_APPLE,
    steps: metrics.steps ?? undefined,
    sleepMinutes: metrics.sleep_minutes ?? undefined,
    activeCalories: metrics.active_calories_kcal ?? undefined,
    restingHeartRate: metrics.resting_heart_rate_bpm ?? undefined,
    latestActivity: workoutCount
      ? {
          name: `${workoutCount} entraînement${workoutCount > 1 ? 's' : ''} Apple Santé`,
          type: 'HealthKit',
        }
      : null,
    healthProvenance: row.provenance || null,
  };
}

function setHealthPrivacy(message) {
  const privacy = document.getElementById('healthPrivacy');
  if (privacy) privacy.textContent = message;
}

function hasGarminHealthData(summary) {
  return Boolean(
    summary?.sourceFormat && summary.sourceFormat !== HEALTH_SOURCE_FORMAT_APPLE,
  );
}

function appleHealthIsNewerThan(appleSummary, currentSummary) {
  return Boolean(
    appleSummary &&
      (!hasGarminHealthData(currentSummary) ||
        appleSummary.observedOn > (currentSummary.observedOn || '')),
  );
}

async function loadLegacyHealthSnapshot(client, userId) {
  const result = await client
    .from('health_snapshots')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data;
}

async function saveLegacyHealthSnapshot(client, summary, userId) {
  if (!summary || summary.sourceFormat === HEALTH_SOURCE_FORMAT_APPLE) return;

  const result = await client
    .from('health_snapshots')
    .upsert(healthDbRow(summary, userId), { onConflict: 'user_id' });

  if (result.error) throw result.error;
}

async function latestAppleHealth(client, userId) {
  const result = await client
    .from('health_daily_summaries')
    .select(HEALTH_APPLE_SELECT)
    .eq('user_id', userId)
    .eq('source', HEALTH_SOURCE_APPLE)
    .order('observed_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data;
}

async function restoreLegacyHealthSnapshot(client, userId) {
  const row = await loadLegacyHealthSnapshot(client, userId);
  if (!row) return null;

  const summary = healthFromDb(row);
  paintHealth(summary);
  saveHealthLocal(summary);
  healthStatus.textContent = `Données retrouvées${summary.observedOn ? ` · ${summary.observedOn}` : ''}.`;
  return summary;
}

async function syncHealthWithSession(session) {
  if (!session?.user) {
    setHealthPrivacy('Données locales tant que vous n’êtes pas connecté.');
    return;
  }

  try {
    const client = supabaseClient || (await loadSupabase());
    const userId = session.user.id;

    await saveLegacyHealthSnapshot(client, healthSummary, userId);
    if (!healthSummary) {
      healthSummary = await restoreLegacyHealthSnapshot(client, userId);
    }

    const appleSummary = appleHealthFromDb(await latestAppleHealth(client, userId));
    if (appleHealthIsNewerThan(appleSummary, healthSummary)) {
      paintHealth(appleSummary);
      saveHealthLocal(appleSummary);
      healthStatus.textContent = `Apple Santé synchronisée${appleSummary.observedOn ? ` · ${appleSummary.observedOn}` : ''}.`;
    }

    setHealthPrivacy(
      appleSummary
        ? `Apple Santé · dernière journée reçue : ${appleSummary.observedOn}.`
        : 'Synchronisé dans votre espace Supabase privé.',
    );
  } catch {
    setHealthPrivacy('Données conservées localement · synchronisation indisponible.');
  }
}
