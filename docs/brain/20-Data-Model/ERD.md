---
type: data-model
title: Data model
schema_version: 35
tags: [data-model, erd, generated]
---

# Data model — schema version 35

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

100 tables, plus 4 FTS5 shadow tables (`coach_posts_fts`, `exercise_translations_fts`, `food_translations_fts`, `foods_fts`).

```mermaid
erDiagram
  users ||--o{ audit_log : "actor_id"
  muscle_groups ||--o{ body_area_muscle_map : "muscle_group_id"
  measurement_metrics ||--o{ body_measurements : "metric_key"
  users ||--o{ body_measurements : "client_user_id"
  tasks ||--o{ challenge_draws : "picked_task_id"
  challenges ||--o{ challenge_draws : "picked_challenge_id"
  challenges ||--o{ challenge_draws : "option3_id"
  challenges ||--o{ challenge_draws : "option2_id"
  challenges ||--o{ challenge_draws : "option1_id"
  users ||--o{ challenge_draws : "user_id"
  users ||--o{ challenges : "user_id"
  teams ||--o{ coach_clients : "team_id"
  users ||--o{ coach_clients : "client_id"
  users ||--o{ coach_clients : "coach_id"
  coach_profiles ||--o{ coach_follows : "coach_user_id"
  users ||--o{ coach_follows : "follower_user_id"
  users ||--o{ coach_posts : "removed_by"
  public_currencies ||--o{ coach_posts : "price_currency"
  public_cities ||--o{ coach_posts : "city_key"
  post_kinds ||--o{ coach_posts : "kind_key"
  users ||--o{ coach_posts : "author_user_id"
  coach_specialties ||--o{ coach_profile_specialties : "specialty_key"
  coach_profiles ||--o{ coach_profile_specialties : "user_id"
  users ||--o{ coach_profiles : "removed_by"
  users ||--o{ coach_profiles : "verified_by"
  public_cities ||--o{ coach_profiles : "city_key"
  users ||--o{ coach_profiles : "user_id"
  subscription_tiers ||--o{ coach_subscriptions : "tier_key"
  users ||--o{ coach_subscriptions : "coach_id"
  coin_purchases ||--o{ coin_entitlements : "purchase_id"
  coin_store_items ||--o{ coin_entitlements : "item_id"
  users ||--o{ coin_entitlements : "user_id"
  point_rule_sets ||--o{ coin_events : "rules_version"
  coin_events ||--o{ coin_events : "reverses_event_id"
  coin_reasons ||--o{ coin_events : "reason_key"
  users ||--o{ coin_events : "user_id"
  users ||--o{ coin_ledger : "actor_user_id"
  coin_reasons ||--o{ coin_ledger : "reason_key"
  users ||--o{ coin_ledger : "user_id"
  coin_store_items ||--o{ coin_purchases : "item_id"
  users ||--o{ coin_purchases : "user_id"
  users ||--o{ coin_wallets : "user_id"
  users ||--o{ content_reports : "resolved_by"
  report_statuses ||--o{ content_reports : "status_key"
  report_reasons ||--o{ content_reports : "reason_key"
  users ||--o{ content_reports : "reporter_user_id"
  users ||--o{ content_reports : "subject_author_user_id"
  coach_profiles ||--o{ content_reports : "subject_profile_id"
  coach_posts ||--o{ content_reports : "subject_post_id"
  users ||--o{ conversations : "blocked_by"
  users ||--o{ conversations : "coach_id"
  users ||--o{ conversations : "client_id"
  coach_clients ||--o{ conversations : "coach_client_id"
  point_rule_sets ||--o{ daily_summaries : "rules_version"
  users ||--o{ daily_summaries : "user_id"
  users ||--o{ element_style_config : "updated_by"
  users ||--o{ event_reminders : "user_id"
  events ||--o{ event_reminders : "event_id"
  users ||--o{ events : "user_id"
  equipment ||--o{ exercise_equipment_map : "equipment_id"
  exercises ||--o{ exercise_equipment_map : "exercise_id"
  exercises ||--o{ exercise_media : "exercise_id"
  muscle_groups ||--o{ exercise_muscle_map : "muscle_group_id"
  exercises ||--o{ exercise_muscle_map : "exercise_id"
  exercises ||--o{ exercise_translations : "exercise_id"
  users ||--o{ exercises : "owner_id"
  point_rule_sets ||--o{ focus_sessions : "rules_version"
  users ||--o{ focus_sessions : "user_id"
  foods ||--o{ food_translations : "food_id"
  users ||--o{ foods : "owner_user_id"
  guidelines_versions ||--o{ guidelines_acceptances : "version"
  users ||--o{ guidelines_acceptances : "user_id"
  point_rule_sets ||--o{ habit_day_results : "rules_version"
  users ||--o{ habit_day_results : "user_id"
  habits ||--o{ habit_day_results : "habit_id"
  users ||--o{ habit_logs : "user_id"
  habits ||--o{ habit_logs : "habit_id"
  users ||--o{ habits : "user_id"
  teams ||--o{ invite_codes : "team_id"
  users ||--o{ invite_codes : "coach_id"
  users ||--o{ invite_redemptions : "user_id"
  invite_codes ||--o{ invite_redemptions : "code_id"
  foods ||--o{ meal_items : "food_id"
  meals ||--o{ meal_items : "meal_id"
  nutrition_plans ||--o{ meal_items : "plan_id"
  nutrition_plan_days ||--o{ meals : "day_id"
  nutrition_plans ||--o{ meals : "plan_id"
  messages ||--o{ message_attachments : "message_id"
  users ||--o{ message_reports : "resolved_by"
  users ||--o{ message_reports : "reporter_id"
  messages ||--o{ message_reports : "message_id"
  users ||--o{ messages : "sender_id"
  conversations ||--o{ messages : "conversation_id"
  coach_clients ||--o{ notifications : "coach_client_id"
  users ||--o{ notifications : "user_id"
  foods ||--o{ nutrition_log_items : "food_id"
  nutrition_plan_days ||--o{ nutrition_log_items : "plan_day_id"
  users ||--o{ nutrition_log_items : "client_user_id"
  nutrition_plans ||--o{ nutrition_plan_days : "plan_id"
  nutrition_plans ||--o{ nutrition_plans : "source_plan_id"
  users ||--o{ nutrition_plans : "client_user_id"
  coach_clients ||--o{ nutrition_plans : "coach_client_id"
  users ||--o{ nutrition_plans : "author_user_id"
  equipment ||--o{ onboarding_equipment : "equipment_id"
  onboarding_profiles ||--o{ onboarding_equipment : "user_id"
  onboarding_profiles ||--o{ onboarding_limitations : "user_id"
  users ||--o{ onboarding_profiles : "user_id"
  users ||--o{ point_rule_sets : "created_by"
  post_media_mimes ||--o{ post_media : "mime"
  post_media_roles ||--o{ post_media : "role_key"
  coach_posts ||--o{ post_media : "post_id"
  coach_clients ||--o{ progress_access_log : "coach_client_id"
  users ||--o{ progress_access_log : "viewer_user_id"
  users ||--o{ progress_access_log : "subject_user_id"
  users ||--o{ progress_photos : "client_user_id"
  users ||--o{ progress_shares : "client_user_id"
  coach_clients ||--o{ progress_shares : "coach_client_id"
  users ||--o{ push_devices : "user_id"
  invite_codes ||--o{ referrals : "code_id"
  users ||--o{ referrals : "referred_user_id"
  users ||--o{ referrals : "coach_id"
  users ||--o{ refresh_tokens : "user_id"
  notifications ||--o{ reminder_deliveries : "notification_id"
  tasks ||--o{ reminder_deliveries : "task_id"
  habits ||--o{ reminder_deliveries : "habit_id"
  events ||--o{ reminder_deliveries : "event_id"
  users ||--o{ reminder_deliveries : "user_id"
  rewards ||--o{ reward_redemptions : "reward_id"
  users ||--o{ reward_redemptions : "user_id"
  users ||--o{ rewards : "user_id"
  challenges ||--o{ tasks : "challenge_id"
  tasks ||--o{ tasks : "parent_task_id"
  users ||--o{ tasks : "user_id"
  languages ||--o{ taxonomy_translations : "lang"
  users ||--o{ teams : "coach_id"
  achievements ||--o{ user_achievements : "achievement_key"
  users ||--o{ user_achievements : "user_id"
  users ||--o{ user_prefs : "user_id"
  theme_packs ||--o{ user_theme_prefs : "pack"
  users ||--o{ user_theme_prefs : "user_id"
  users ||--o{ users : "created_by"
  coach_clients ||--o{ workout_calendar_feeds : "coach_client_id"
  workout_plans ||--o{ workout_calendar_feeds : "plan_id"
  users ||--o{ workout_calendar_feeds : "user_id"
  exercises ||--o{ workout_log_exercises : "substituted_for_exercise_id"
  workout_plan_exercises ||--o{ workout_log_exercises : "plan_exercise_id"
  exercises ||--o{ workout_log_exercises : "exercise_id"
  users ||--o{ workout_log_exercises : "client_user_id"
  workout_logs ||--o{ workout_log_exercises : "log_id"
  workout_log_sets ||--o{ workout_log_sets : "corrects_set_id"
  workout_plan_set_targets ||--o{ workout_log_sets : "plan_set_target_id"
  exercises ||--o{ workout_log_sets : "exercise_id"
  users ||--o{ workout_log_sets : "client_user_id"
  workout_logs ||--o{ workout_log_sets : "log_id"
  workout_log_exercises ||--o{ workout_log_sets : "log_exercise_id"
  workout_plan_days ||--o{ workout_logs : "plan_day_id"
  workout_plans ||--o{ workout_logs : "plan_id"
  coach_clients ||--o{ workout_logs : "coach_client_id"
  users ||--o{ workout_logs : "client_user_id"
  workout_plan_days ||--o{ workout_plan_blocks : "day_id"
  workout_plans ||--o{ workout_plan_blocks : "plan_id"
  users ||--o{ workout_plan_day_exceptions : "created_by"
  workout_plan_days ||--o{ workout_plan_day_exceptions : "day_id"
  workout_plans ||--o{ workout_plan_day_exceptions : "plan_id"
  workout_plans ||--o{ workout_plan_days : "plan_id"
  exercises ||--o{ workout_plan_exercises : "exercise_id"
  workout_plan_blocks ||--o{ workout_plan_exercises : "block_id"
  workout_plans ||--o{ workout_plan_exercises : "plan_id"
  workout_plan_exercises ||--o{ workout_plan_set_targets : "exercise_row_id"
  workout_plans ||--o{ workout_plan_set_targets : "plan_id"
  workout_plans ||--o{ workout_plans : "source_plan_id"
  users ||--o{ workout_plans : "client_user_id"
  coach_clients ||--o{ workout_plans : "coach_client_id"
  users ||--o{ workout_plans : "author_user_id"
  workout_logs ||--o{ workout_pr_events : "log_id"
  workout_log_sets ||--o{ workout_pr_events : "source_set_id"
  exercises ||--o{ workout_pr_events : "exercise_id"
  users ||--o{ workout_pr_events : "client_user_id"
```

## Tables

| Table | Columns | Rows |
|---|---|---|
| [[achievements]] | 6 | 7 |
| [[audit_log]] | 9 | 6 |
| [[body_area_muscle_map]] | 3 | 44 |
| [[body_measurements]] | 8 | 0 |
| [[challenge_draws]] | 13 | 0 |
| [[challenges]] | 11 | 0 |
| [[coach_clients]] | 11 | 0 |
| [[coach_follows]] | 3 | 0 |
| [[coach_posts]] | 24 | 0 |
| [[coach_profile_specialties]] | 2 | 0 |
| [[coach_profiles]] | 18 | 0 |
| [[coach_specialties]] | 4 | 14 |
| [[coach_subscriptions]] | 9 | 2 |
| [[coin_entitlements]] | 8 | 0 |
| [[coin_events]] | 14 | 0 |
| [[coin_ledger]] | 11 | 0 |
| [[coin_purchases]] | 9 | 0 |
| [[coin_reasons]] | 9 | 19 |
| [[coin_store_items]] | 10 | 2 |
| [[coin_wallets]] | 4 | 3 |
| [[content_reports]] | 15 | 0 |
| [[conversations]] | 9 | 0 |
| [[daily_summaries]] | 15 | 0 |
| [[element_style_config]] | 4 | 27 |
| [[equipment]] | 4 | 16 |
| [[event_reminders]] | 5 | 0 |
| [[events]] | 15 | 0 |
| [[exercise_equipment_map]] | 2 | 0 |
| [[exercise_media]] | 11 | 0 |
| [[exercise_muscle_map]] | 3 | 0 |
| [[exercise_translations]] | 10 | 0 |
| [[exercises]] | 16 | 0 |
| [[focus_sessions]] | 17 | 0 |
| [[food_translations]] | 8 | 285 |
| [[foods]] | 17 | 95 |
| [[guidelines_acceptances]] | 4 | 0 |
| [[guidelines_versions]] | 4 | 1 |
| [[habit_day_results]] | 17 | 0 |
| [[habit_logs]] | 9 | 0 |
| [[habits]] | 18 | 0 |
| [[invite_codes]] | 11 | 0 |
| [[invite_redemptions]] | 6 | 5 |
| [[languages]] | 6 | 25 |
| [[meal_items]] | 15 | 0 |
| [[meals]] | 9 | 0 |
| [[measurement_metrics]] | 6 | 15 |
| [[message_attachments]] | 7 | 0 |
| [[message_reports]] | 10 | 0 |
| [[messages]] | 8 | 0 |
| [[muscle_groups]] | 5 | 20 |
| [[notifications]] | 9 | 0 |
| [[nutrition_log_items]] | 16 | 0 |
| [[nutrition_plan_days]] | 11 | 0 |
| [[nutrition_plans]] | 18 | 0 |
| [[onboarding_equipment]] | 2 | 0 |
| [[onboarding_limitations]] | 6 | 0 |
| [[onboarding_profiles]] | 18 | 0 |
| [[point_rule_sets]] | 5 | 1 |
| [[post_kinds]] | 6 | 3 |
| [[post_media]] | 15 | 0 |
| [[post_media_mimes]] | 2 | 3 |
| [[post_media_roles]] | 1 | 2 |
| [[processor_events]] | 7 | 0 |
| [[progress_access_log]] | 8 | 0 |
| [[progress_photos]] | 11 | 0 |
| [[progress_shares]] | 8 | 0 |
| [[public_cities]] | 5 | 10 |
| [[public_currencies]] | 3 | 4 |
| [[public_policy]] | 3 | 8 |
| [[push_devices]] | 7 | 0 |
| [[referrals]] | 6 | 0 |
| [[refresh_tokens]] | 9 | 0 |
| [[reminder_deliveries]] | 11 | 0 |
| [[report_reasons]] | 5 | 12 |
| [[report_statuses]] | 3 | 5 |
| [[reserved_handles]] | 1 | 53 |
| [[retired_handles]] | 3 | 0 |
| [[reward_redemptions]] | 10 | 0 |
| [[rewards]] | 11 | 0 |
| [[schema_migrations]] | 2 | 34 |
| [[subscription_tiers]] | 9 | 4 |
| [[tasks]] | 19 | 0 |
| [[taxonomy_translations]] | 7 | 72 |
| [[teams]] | 7 | 0 |
| [[theme_packs]] | 6 | 7 |
| [[user_achievements]] | 7 | 0 |
| [[user_prefs]] | 8 | 3 |
| [[user_theme_prefs]] | 6 | 0 |
| [[users]] | 13 | 3 |
| [[workout_calendar_feeds]] | 11 | 0 |
| [[workout_log_exercises]] | 15 | 0 |
| [[workout_log_sets]] | 31 | 0 |
| [[workout_logs]] | 29 | 0 |
| [[workout_plan_blocks]] | 10 | 0 |
| [[workout_plan_day_exceptions]] | 9 | 0 |
| [[workout_plan_days]] | 11 | 0 |
| [[workout_plan_exercises]] | 23 | 0 |
| [[workout_plan_set_targets]] | 14 | 0 |
| [[workout_plans]] | 20 | 0 |
| [[workout_pr_events]] | 17 | 0 |

## Conventions that hold everywhere

- `INTEGER PRIMARY KEY id`; `created_at` / `updated_at` as unix epoch seconds.
- Enums are CHECK constraints; a lookup TABLE is used wherever an admin must edit the set.
- Junction tables for every m:n relation — never a JSON list of relations.
- JSON columns only for non-relational config blobs (a gradient definition, a notification payload).
- Every client-owned row carries an owner column with a composite index.
