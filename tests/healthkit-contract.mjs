import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(testsDirectory);
const fixturePath = path.join(testsDirectory, 'fixtures', 'healthkit-daily-summary-v1.json');
const contractPath = path.join(projectRoot, 'ios', 'PLPHealthKit', 'PLPHealthKit', 'HealthSyncContract.swift');
const migrationPath = path.join(projectRoot, 'supabase', 'migrations', '20260921020000_create_health_daily_summaries.sql');
const webReaderPath = path.join(projectRoot, 'dist', 'js', 'features', 'health-sync.js');

const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const contractSource = fs.readFileSync(contractPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const webReader = fs.readFileSync(webReaderPath, 'utf8');

assert.equal(payload.source, 'apple_health');
assert.equal(payload.source_record_key, 'apple_health_daily:v1');
assert.equal(payload.metrics_version, 1);
assert.match(payload.observed_on, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(Number.isFinite(Date.parse(payload.captured_at)));

const expectedMetrics = [
  'active_calories_kcal',
  'resting_heart_rate_bpm',
  'sleep_minutes',
  'steps',
  'workout_count',
];
assert.deepEqual(Object.keys(payload.metrics).sort(), expectedMetrics);
assert.equal(payload.provenance.garmin_connect_shared_to_health, false);
assert.equal(payload.provenance.completeness, 'partial');

assert.match(contractSource, /static let source = "apple_health"/);
assert.match(contractSource, /static let sourceRecordKey = "apple_health_daily:v1"/);
assert.match(contractSource, /static let metricsVersion = 1/);
assert.match(contractSource, /static let provenanceCompleteness = "partial"/);
assert.match(contractSource, /static let garminConnectSharedToHealth = false/);
assert.match(migration, /source in \('garmin_file', 'apple_health'\)/);
assert.match(migration, /unique \(user_id, source, source_record_key, observed_on\)/);
assert.match(webReader, /const HEALTH_SOURCE_APPLE = 'apple_health'/);
assert.match(webReader, /health_daily_summaries/);

console.log('HealthKit contract v1 is internally consistent.');
