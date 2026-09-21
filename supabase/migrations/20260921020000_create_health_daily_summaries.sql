-- Historique quotidien pour le futur compagnon iPhone HealthKit.
-- Cette table est additive : health_snapshots continue de servir l'import Garmin web.
create table if not exists public.health_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  observed_on date not null,
  source text not null check (source in ('garmin_file', 'apple_health')),
  source_record_key text not null,
  timezone text not null,
  captured_at timestamptz not null,
  metrics_version smallint not null default 1 check (metrics_version > 0),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_record_key, observed_on)
);

create index if not exists health_daily_summaries_user_date_idx
  on public.health_daily_summaries (user_id, observed_on desc);

alter table public.health_daily_summaries enable row level security;

revoke all on table public.health_daily_summaries from anon;
revoke all on table public.health_daily_summaries from authenticated;
grant select, insert, update, delete on table public.health_daily_summaries to authenticated;

create policy "Users can read their daily health summaries"
on public.health_daily_summaries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their daily health summaries"
on public.health_daily_summaries for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their daily health summaries"
on public.health_daily_summaries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their daily health summaries"
on public.health_daily_summaries for delete to authenticated
using ((select auth.uid()) = user_id);
