import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const html = source('dist/index.html');
const security = source('dist/js/security.js');
const account = source('dist/js/features/account.js');
const preview = source('plp-preview.mjs');
const snapshotMigration = source('supabase/migrations/20260920193305_create_health_snapshots.sql');
const dailyMigration = source('supabase/migrations/20260921193155_create_health_daily_summaries.sql');
const hardeningMigration = source('supabase/migrations/20260922075435_harden_health_data_constraints.sql');
const plannerMigration = source('supabase/migrations/20260922204659_create_user_planner_schedules.sql');

assert.match(html, /http-equiv="Content-Security-Policy"/);
assert.match(html, /object-src 'none'/);
assert.match(html, /name="referrer" content="no-referrer"/);
assert.doesNotMatch(security, /@supabase\/supabase-js@2(?:['"/]|$)/);
assert.match(security, /integrity: 'sha384-/);
assert.match(security, /archiveExpandedBytes: 80 \* mebibyte/);
assert.match(account, /signOut\(\{ scope: 'local' \}\)/);
assert.doesNotMatch(account, /message\.textContent\s*=\s*error\.message/);
assert.match(html, /id="personalAccount"/);
assert.doesNotMatch(html, /id="accountButton"/);
assert.match(account, /user_planner_schedules/);
assert.match(preview, /pathFromRoot\.startsWith\(`\.\./);
assert.match(preview, /'X-Content-Type-Options': 'nosniff'/);

for (const migration of [snapshotMigration, dailyMigration]) {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
}
assert.match(hardeningMigration, /pg_column_size\(raw_summary\) <= 32768/);
assert.match(hardeningMigration, /sleep_minutes between 0 and 1440/);
assert.match(plannerMigration, /enable row level security/);
assert.match(plannerMigration, /\(select auth\.uid\(\)\) = user_id/);
assert.match(plannerMigration, /jsonb_array_length\(schedule_data -> 'events'\) <= 500/);

console.log('Security contract is internally consistent.');
