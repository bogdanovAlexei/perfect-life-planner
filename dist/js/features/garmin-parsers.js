const healthAliases = {
  observedOn: ['date', 'calendarDate', 'calendar_date', 'startTime', 'start_time', 'timestamp', 'timeCreated'],
  steps: ['steps', 'totalSteps', 'total_steps', 'stepCount', 'step_count', 'dailySteps', 'cumulativeSteps'],
  stepGoal: ['stepGoal', 'step_goal', 'stepsGoal', 'steps_goal', 'dailyStepGoal', 'goalSteps'],
  sleepMinutes: ['sleepMinutes', 'sleep_minutes', 'totalSleepMinutes', 'total_sleep_minutes', 'sleepDurationMinutes'],
  sleepSeconds: ['sleepSeconds', 'sleep_seconds', 'totalSleepSeconds', 'total_sleep_seconds', 'sleepTimeSeconds', 'durationInSeconds'],
  activeCalories: ['activeCalories', 'active_calories', 'activeKilocalories', 'active_kilocalories', 'activityCalories'],
  totalCalories: ['totalCalories', 'total_calories', 'totalKilocalories', 'total_kilocalories', 'calories'],
  restingHeartRate: ['restingHeartRate', 'resting_heart_rate', 'restingHr', 'resting_hr'],
  averageHeartRate: ['averageHeartRate', 'average_heart_rate', 'avgHeartRate', 'avg_heart_rate', 'heartRateAvg'],
  stressAverage: ['stressAverage', 'stress_average', 'averageStressLevel', 'average_stress_level', 'avgStress', 'stress'],
  hrvMs: ['hrvMs', 'hrv_ms', 'hrv', 'hrvStatus', 'lastNightAvg', 'weeklyAvg'],
  activityName: ['activityName', 'activity_name', 'name', 'title'],
  activityType: ['activityType', 'activity_type', 'sport', 'subSport'],
  activityDuration: ['activityDurationMinutes', 'activity_duration_minutes', 'durationMinutes', 'totalTimerTime', 'totalElapsedTime'],
  activityDistance: ['activityDistanceKm', 'activity_distance_km', 'distanceKm', 'totalDistance', 'distance'],
};

const healthRanges = {
  steps: [0, 1_000_000],
  stepGoal: [0, 1_000_000],
  sleepMinutes: [0, 1_440],
  activeCalories: [0, 100_000],
  totalCalories: [0, 100_000],
  restingHeartRate: [20, 300],
  averageHeartRate: [20, 300],
  stressAverage: [0, 100],
  hrvMs: [0, 1_000],
};

const FIT_SDK_URL = 'https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.214.0/+esm';
const MAX_HEALTH_OBJECTS = 5_000;
const MAX_CSV_ROWS = 50_000;
const MAX_CSV_COLUMNS = 200;

const normalizedKey = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const aliasSets = Object.fromEntries(Object.entries(healthAliases).map(([name, values]) => [name, new Set(values.map(normalizedKey))]));

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedNumber(value, range) {
  const numeric = finiteNumber(value);
  if (numeric === null || numeric < range[0] || numeric > range[1]) return null;
  return numeric;
}

function valueFor(object, alias) {
  if (!object || typeof object !== 'object') return null;
  for (const [key, value] of Object.entries(object)) {
    if (aliasSets[alias].has(normalizedKey(key)) && value !== '' && value !== null && value !== undefined) return value;
  }
  return null;
}

function collectHealthObjects(value, result = [], depth = 0) {
  if (depth > 8 || result.length >= MAX_HEALTH_OBJECTS || value === null || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (result.length >= MAX_HEALTH_OBJECTS) break;
      collectHealthObjects(item, result, depth + 1);
    }
    return result;
  }
  result.push(value);
  for (const item of Object.values(value)) {
    if (result.length >= MAX_HEALTH_OBJECTS) break;
    collectHealthObjects(item, result, depth + 1);
  }
  return result;
}

function parseObservedDate(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

function candidateFromObject(object) {
  const sleepMinutes = finiteNumber(valueFor(object, 'sleepMinutes'));
  const sleepSeconds = finiteNumber(valueFor(object, 'sleepSeconds'));
  const activityDuration = finiteNumber(valueFor(object, 'activityDuration'));
  const rawDistance = finiteNumber(valueFor(object, 'activityDistance'));
  const candidate = {
    observedOn: parseObservedDate(valueFor(object, 'observedOn')),
    steps: boundedNumber(valueFor(object, 'steps'), healthRanges.steps),
    stepGoal: boundedNumber(valueFor(object, 'stepGoal'), healthRanges.stepGoal),
    sleepMinutes: boundedNumber(sleepMinutes ?? (sleepSeconds === null ? null : sleepSeconds / 60), healthRanges.sleepMinutes),
    activeCalories: boundedNumber(valueFor(object, 'activeCalories'), healthRanges.activeCalories),
    totalCalories: boundedNumber(valueFor(object, 'totalCalories'), healthRanges.totalCalories),
    restingHeartRate: boundedNumber(valueFor(object, 'restingHeartRate'), healthRanges.restingHeartRate),
    averageHeartRate: boundedNumber(valueFor(object, 'averageHeartRate'), healthRanges.averageHeartRate),
    stressAverage: boundedNumber(valueFor(object, 'stressAverage'), healthRanges.stressAverage),
    hrvMs: boundedNumber(valueFor(object, 'hrvMs'), healthRanges.hrvMs),
  };
  const activityName = valueFor(object, 'activityName');
  const activityType = valueFor(object, 'activityType');
  if (activityName || activityType || activityDuration !== null || rawDistance !== null) {
    candidate.latestActivity = {
      name: String(activityName || activityType || 'Activité Garmin').slice(0, 120),
      type: String(activityType || '').slice(0, 80),
      durationMinutes: activityDuration === null ? null : Math.max(0, Math.min(10_080, Math.round(activityDuration > 600 ? activityDuration / 60 : activityDuration))),
      distanceKm: rawDistance === null ? null : Math.max(0, Math.min(10_000, Number((rawDistance > 1000 ? rawDistance / 1000 : rawDistance).toFixed(2)))),
    };
  }
  return candidate;
}

function mergeHealthSummaries(summaries) {
  const merged = {};
  const numeric = Object.keys(healthRanges);
  const sorted = summaries.filter(Boolean).sort((left, right) => String(left.observedOn || '').localeCompare(String(right.observedOn || '')));
  for (const summary of sorted) {
    if (summary.observedOn) merged.observedOn = summary.observedOn;
    numeric.forEach((key) => {
      if (summary[key] !== null && summary[key] !== undefined) merged[key] = Math.round(Number(summary[key]) * 10) / 10;
    });
    if (summary.latestActivity) merged.latestActivity = summary.latestActivity;
  }
  return merged;
}

function extractHealthSummary(payload) {
  const candidates = collectHealthObjects(payload).map(candidateFromObject);
  const merged = mergeHealthSummaries(candidates);
  if (payload?.hrvMesgs) {
    const values = payload.hrvMesgs.flatMap((message) => Array.isArray(message.time) ? message.time : []).map(finiteNumber).filter((value) => value !== null && value > 0 && value < 500);
    if (values.length) merged.hrvMs = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return merged;
}

function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = [',', ';', '\t'].sort((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length && rows.length <= MAX_CSV_ROWS; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      if (row.length >= MAX_CSV_COLUMNS) throw new Error('Le fichier CSV contient trop de colonnes.');
      row.push(field.trim()); field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += character;
  }
  if (rows.length > MAX_CSV_ROWS) throw new Error('Le fichier CSV contient trop de lignes.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header, index) => header || `colonne_${index + 1}`);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function parseFitData(file) {
  window.PLPSecurity.validateFile(file, {
    maxBytes: window.PLPSecurity.limits.healthFileBytes,
    extensions: ['fit'],
    sizeMessage: 'Ce fichier FIT est trop volumineux.',
    typeMessage: 'Le fichier FIT n’est pas valide.',
  });
  const sdk = await import(FIT_SDK_URL);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stream = sdk.Stream.fromByteArray(Array.from(bytes));
  if (!sdk.Decoder.isFIT(stream)) throw new Error('Ce fichier ne possède pas un en-tête FIT valide.');
  const decoded = new sdk.Decoder(stream).read({ convertDateTimesToDates: true, mergeHeartRates: true });
  if (decoded.errors?.length && !decoded.messages) throw new Error('Le fichier FIT est endommagé.');
  return extractHealthSummary(decoded.messages || {});
}

function assertSafeArchive(files) {
  const allEntries = Object.values(files);
  if (allEntries.length > window.PLPSecurity.limits.archiveEntries) throw new Error('Cette archive contient trop de fichiers.');
  const entries = allEntries.filter((entry) => !entry.dir && /[.](fit|csv|json)$/i.test(entry.name));
  let expandedBytes = 0;
  entries.forEach((entry) => {
    const entryBytes = Number(entry?._data?.uncompressedSize || 0);
    if (entryBytes > window.PLPSecurity.limits.archiveEntryBytes) throw new Error('Un fichier de l’archive est trop volumineux.');
    expandedBytes += entryBytes;
  });
  if (expandedBytes > window.PLPSecurity.limits.archiveExpandedBytes) throw new Error('Le contenu décompressé de cette archive est trop volumineux.');
  return entries;
}

async function parseHealthFile(file) {
  const extension = window.PLPSecurity.validateFile(file, {
    maxBytes: window.PLPSecurity.limits.healthFileBytes,
    extensions: ['fit', 'zip', 'json', 'csv'],
    sizeMessage: 'Ce fichier est trop volumineux (30 Mo maximum).',
    typeMessage: 'Utilisez un fichier FIT, CSV, JSON ou ZIP.',
  });
  if (['json', 'csv'].includes(extension) && file.size > window.PLPSecurity.limits.textImportBytes) {
    throw new Error('Ce fichier texte est trop volumineux (10 Mo maximum).');
  }
  if (extension === 'fit') return parseFitData(file);

  if (extension === 'zip') {
    const JSZip = await window.PLPSecurity.loadScript('jszip');
    const archive = await JSZip.loadAsync(file, { checkCRC32: true });
    const entries = assertSafeArchive(archive.files);
    const summaries = [];
    for (const entry of entries) {
      try {
        if (/[.]fit$/i.test(entry.name)) {
          const blob = await entry.async('blob');
          summaries.push(await parseFitData(new File([blob], entry.name, { type: 'application/octet-stream' })));
        }
        else {
          const text = await entry.async('string');
          if (new Blob([text]).size > window.PLPSecurity.limits.textImportBytes) throw new Error('Un fichier texte décompressé est trop volumineux.');
          summaries.push(extractHealthSummary(/[.]json$/i.test(entry.name) ? JSON.parse(text) : parseDelimited(text)));
        }
      } catch (error) {
        if (/trop|volumineux/i.test(error?.message || '')) throw error;
      }
    }
    if (!summaries.length) throw new Error('Aucun fichier FIT, CSV ou JSON exploitable trouvé dans cette archive.');
    return mergeHealthSummaries(summaries);
  }

  const text = await file.text();
  if (extension === 'json') return extractHealthSummary(JSON.parse(text));
  return extractHealthSummary(parseDelimited(text));
}
