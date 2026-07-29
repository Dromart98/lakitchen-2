alter table public.user_saved_ai_recipe_cooking_yields
  alter column updated_at type timestamptz(3)
  using date_trunc('milliseconds', updated_at);

alter table public.user_saved_ai_recipe_cooked_batches
  alter column source_measurement_updated_at type timestamptz(3)
  using date_trunc('milliseconds', source_measurement_updated_at);

alter table public.user_saved_ai_recipe_cooked_batches
  rename column source_recipe_id to live_source_recipe_id;

alter table public.user_saved_ai_recipe_cooked_batches
  add column source_recipe_id uuid;

update public.user_saved_ai_recipe_cooked_batches
set source_recipe_id = live_source_recipe_id
where source_recipe_id is null
  and live_source_recipe_id is not null;

alter table public.user_saved_ai_recipe_cooked_batches
  add constraint user_saved_ai_recipe_cooked_batches_atomic_source_check
  check (
    creation_fingerprint is null
    or (
      source_recipe_id is not null
      and source_measurement_updated_at is not null
    )
  );

create or replace function public.prepare_cooked_batch_source_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_recipe_id is null and new.live_source_recipe_id is not null then
    new.source_recipe_id := new.live_source_recipe_id;
  elsif new.live_source_recipe_id is null and new.source_recipe_id is not null then
    new.live_source_recipe_id := new.source_recipe_id;
  elsif new.source_recipe_id is distinct from new.live_source_recipe_id then
    raise exception using errcode = '22023', message = 'Cooked batch source recipe mismatch';
  end if;

  return new;
end;
$$;

create trigger prepare_user_saved_ai_recipe_cooked_batch_source_snapshot
before insert on public.user_saved_ai_recipe_cooked_batches
for each row execute function public.prepare_cooked_batch_source_snapshot();

create or replace function public.prevent_cooked_batch_snapshot_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.source_recipe_id is distinct from old.source_recipe_id
    or new.recipe_title is distinct from old.recipe_title
    or new.raw_weight_g is distinct from old.raw_weight_g
    or new.cooked_weight_g is distinct from old.cooked_weight_g
    or new.servings is distinct from old.servings
    or new.total_calories is distinct from old.total_calories
    or new.total_protein_g is distinct from old.total_protein_g
    or new.total_carbs_g is distinct from old.total_carbs_g
    or new.total_fat_g is distinct from old.total_fat_g
    or new.creation_fingerprint is distinct from old.creation_fingerprint
    or new.source_measurement_updated_at is distinct from old.source_measurement_updated_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'Cooked batch snapshot cannot be changed';
  end if;

  if new.live_source_recipe_id is distinct from old.live_source_recipe_id
    and not (old.live_source_recipe_id is not null and new.live_source_recipe_id is null) then
    raise exception using errcode = '42501', message = 'Cooked batch live source recipe cannot be changed';
  end if;

  return new;
end;
$$;

revoke execute on function public.prepare_cooked_batch_source_snapshot() from public;
revoke execute on function public.prepare_cooked_batch_source_snapshot() from anon;
revoke execute on function public.prepare_cooked_batch_source_snapshot() from authenticated;