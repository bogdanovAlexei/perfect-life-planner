const HEALTH_SOURCE_APPLE = 'apple_health';
const HEALTH_SOURCE_FORMAT_APPLE = 'APPLE HEALTH';
const HEALTH_APPLE_SELECT = 'observed_on,captured_at,metrics,provenance';
const HEALTH_NUMBER_RANGES = {
  steps: [0, 1_000_000], stepGoal: [0, 1_000_000], sleepMinutes: [0, 1_440],
  activeCalories: [0, 100_000], totalCalories: [0, 100_000],
  restingHeartRate: [20, 300], averageHeartRate: [20, 300],
  stressAverage: [0, 100], hrvMs: [0, 1_000],
};

function safeHealthNumber(value, key) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  const range = HEALTH_NUMBER_RANGES[key];
  return Number.isFinite(numeric) && numeric >= range[0] && numeric <= range[1] ? numeric : null;
}

function safeHealthText(value, maximum) {
  return value === null || value === undefined ? null : String(value).slice(0, maximum);
}

function safeHealthDate(value) {
  const match = String(value || '').match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== match[0] ? null : match[0];
}

function safeHealthTimestamp(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

function healthDbRow(summary, userId) {
  return {
    user_id: userId,
    observed_on: safeHealthDate(summary.observedOn),
    imported_at: safeHealthTimestamp(summary.importedAt),
    source_file_name: safeHealthText(summary.sourceFileName, 255),
    source_format: safeHealthText(summary.sourceFormat, 40),
    steps: safeHealthNumber(summary.steps, 'steps'),
    step_goal: safeHealthNumber(summary.stepGoal, 'stepGoal'),
    sleep_minutes: safeHealthNumber(summary.sleepMinutes, 'sleepMinutes'),
    active_calories: safeHealthNumber(summary.activeCalories, 'activeCalories'),
    total_calories: safeHealthNumber(summary.totalCalories, 'totalCalories'),
    resting_heart_rate: safeHealthNumber(summary.restingHeartRate, 'restingHeartRate'),
    average_heart_rate: safeHealthNumber(summary.averageHeartRate, 'averageHeartRate'),
    stress_average: safeHealthNumber(summary.stressAverage, 'stressAverage'),
    hrv_ms: safeHealthNumber(summary.hrvMs, 'hrvMs'),
    latest_activity: summary.latestActivity ? {
      name: safeHealthText(summary.latestActivity.name, 120),
      type: safeHealthText(summary.latestActivity.type, 80),
      durationMinutes: Math.max(0, Math.min(10_080, Number(summary.latestActivity.durationMinutes) || 0)),
      distanceKm: Math.max(0, Math.min(10_000, Number(summary.latestActivity.distanceKm) || 0)),
    } : null,
    raw_summary: { schemaVersion: 1 },
  };
}

function healthFromDb(row) {
  if (!row) return null;

  return {
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
    steps: safeHealthNumber(metrics.steps, 'steps') ?? undefined,
    sleepMinutes: safeHealthNumber(metrics.sleep_minutes, 'sleepMinutes') ?? undefined,
    activeCalories: safeHealthNumber(metrics.active_calories_kcal, 'activeCalories') ?? undefined,
    restingHeartRate: safeHealthNumber(metrics.resting_heart_rate_bpm, 'restingHeartRate') ?? undefined,
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
  if (!summary || summary.sourceFormat === HEALTH_SOURCE_FORMAT_APPLE || summary.sourceFormat === 'DÉMO') return;

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

async function syncHealthWithSession(session, { saveCurrentImport = false } = {}) {
  if (!session?.user) {
    setHealthPrivacy('Données locales tant que vous n’êtes pas connecté.');
    return;
  }

  try {
    const client = await window.PLPAuth?.getClient?.();
    if (!client) throw new Error('SUPABASE_CLIENT_UNAVAILABLE');
    const userId = session.user.id;

    if (saveCurrentImport) await saveLegacyHealthSnapshot(client, healthSummary, userId);
    const storedSummary = await restoreLegacyHealthSnapshot(client, userId);
    healthSummary = storedSummary;

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
