-- One private schedule document per authenticated account.
create table if not exists public.user_planner_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schedule_data jsonb not null default '{"events":[],"freshMode":true,"hideFlexible":false}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_planner_schedules_shape
    check (
      jsonb_typeof(schedule_data) = 'object'
      and schedule_data ? 'events'
      and jsonb_typeof(schedule_data -> 'events') = 'array'
      and jsonb_array_length(schedule_data -> 'events') <= 500
      and pg_column_size(schedule_data) <= 2097152
    )
);

alter table public.user_planner_schedules enable row level security;

revoke all on table public.user_planner_schedules from anon;
revoke all on table public.user_planner_schedules from authenticated;
grant select, insert, update, delete on table public.user_planner_schedules to authenticated;

create policy "Users can read their own planner schedule"
on public.user_planner_schedules for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own planner schedule"
on public.user_planner_schedules for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own planner schedule"
on public.user_planner_schedules for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own planner schedule"
on public.user_planner_schedules for delete to authenticated
using ((select auth.uid()) = user_id);
