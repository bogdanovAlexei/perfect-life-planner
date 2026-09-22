-- Bound user-controlled health payloads so malformed clients cannot store
-- unreasonably large JSON documents or impossible measurements.
alter table public.health_snapshots
  add constraint health_snapshots_source_file_name_length
    check (source_file_name is null or char_length(source_file_name) <= 255),
  add constraint health_snapshots_source_format_length
    check (source_format is null or char_length(source_format) <= 40),
  add constraint health_snapshots_steps_range
    check (steps is null or steps between 0 and 1000000),
  add constraint health_snapshots_step_goal_range
    check (step_goal is null or step_goal between 0 and 1000000),
  add constraint health_snapshots_sleep_minutes_range
    check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  add constraint health_snapshots_active_calories_range
    check (active_calories is null or active_calories between 0 and 100000),
  add constraint health_snapshots_total_calories_range
    check (total_calories is null or total_calories between 0 and 100000),
  add constraint health_snapshots_resting_heart_rate_range
    check (resting_heart_rate is null or resting_heart_rate between 20 and 300),
  add constraint health_snapshots_average_heart_rate_range
    check (average_heart_rate is null or average_heart_rate between 20 and 300),
  add constraint health_snapshots_hrv_range
    check (hrv_ms is null or hrv_ms between 0 and 1000),
  add constraint health_snapshots_latest_activity_shape
    check (
      latest_activity is null
      or (
        jsonb_typeof(latest_activity) = 'object'
        and pg_column_size(latest_activity) <= 4096
      )
    ),
  add constraint health_snapshots_raw_summary_size
    check (jsonb_typeof(raw_summary) = 'object' and pg_column_size(raw_summary) <= 32768);

alter table public.health_daily_summaries
  add constraint health_daily_summaries_source_record_key_length
    check (char_length(source_record_key) between 1 and 120),
  add constraint health_daily_summaries_timezone_length
    check (char_length(timezone) between 1 and 100),
  add constraint health_daily_summaries_metrics_size
    check (pg_column_size(metrics) <= 32768),
  add constraint health_daily_summaries_provenance_size
    check (pg_column_size(provenance) <= 4096);
