create table if not exists public.health_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  observed_on date,
  imported_at timestamptz not null default now(),
  source_file_name text,
  source_format text,
  steps integer check (steps is null or steps >= 0),
  step_goal integer check (step_goal is null or step_goal >= 0),
  sleep_minutes integer check (sleep_minutes is null or sleep_minutes >= 0),
  active_calories integer check (active_calories is null or active_calories >= 0),
  total_calories integer check (total_calories is null or total_calories >= 0),
  resting_heart_rate integer check (resting_heart_rate is null or resting_heart_rate >= 0),
  average_heart_rate integer check (average_heart_rate is null or average_heart_rate >= 0),
  stress_average integer check (stress_average is null or stress_average between 0 and 100),
  hrv_ms numeric check (hrv_ms is null or hrv_ms >= 0),
  latest_activity jsonb,
  raw_summary jsonb not null default '{}'::jsonb
);

alter table public.health_snapshots enable row level security;

revoke all on table public.health_snapshots from anon;
revoke all on table public.health_snapshots from authenticated;
grant select, insert, update, delete on table public.health_snapshots to authenticated;

create policy "Users can read their health snapshot"
on public.health_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their health snapshot"
on public.health_snapshots for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their health snapshot"
on public.health_snapshots for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their health snapshot"
on public.health_snapshots for delete to authenticated
using ((select auth.uid()) = user_id);
