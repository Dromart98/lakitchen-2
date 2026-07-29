create table public.user_saved_ai_recipe_cooked_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_recipe_id uuid,
  recipe_title text not null,
  raw_weight_g double precision not null,
  cooked_weight_g double precision not null,
  servings integer not null,
  total_calories double precision not null,
  total_protein_g double precision not null,
  total_carbs_g double precision not null,
  total_fat_g double precision not null,
  consumed_cooked_weight_g double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_saved_ai_recipe_cooked_batches_source_owner_fkey
    foreign key (source_recipe_id, user_id)
    references public.user_saved_ai_recipes(id, user_id)
    on delete set null (source_recipe_id),
  constraint user_saved_ai_recipe_cooked_batches_title_check
    check (recipe_title = btrim(recipe_title) and char_length(recipe_title) between 1 and 90),
  constraint user_saved_ai_recipe_cooked_batches_raw_weight_check
    check (raw_weight_g > 0 and raw_weight_g <> 'Infinity'::double precision and raw_weight_g <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_cooked_weight_check
    check (cooked_weight_g > 0 and cooked_weight_g <> 'Infinity'::double precision and cooked_weight_g <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_servings_check
    check (servings > 0),
  constraint user_saved_ai_recipe_cooked_batches_total_calories_check
    check (total_calories >= 0 and total_calories <> 'Infinity'::double precision and total_calories <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_total_protein_check
    check (total_protein_g >= 0 and total_protein_g <> 'Infinity'::double precision and total_protein_g <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_total_carbs_check
    check (total_carbs_g >= 0 and total_carbs_g <> 'Infinity'::double precision and total_carbs_g <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_total_fat_check
    check (total_fat_g >= 0 and total_fat_g <> 'Infinity'::double precision and total_fat_g <> 'NaN'::double precision),
  constraint user_saved_ai_recipe_cooked_batches_consumed_weight_check
    check (
      consumed_cooked_weight_g >= 0
      and consumed_cooked_weight_g <= cooked_weight_g
      and consumed_cooked_weight_g <> 'Infinity'::double precision
      and consumed_cooked_weight_g <> 'NaN'::double precision
    )
);

create index user_saved_ai_recipe_cooked_batches_user_created_idx
  on public.user_saved_ai_recipe_cooked_batches(user_id, created_at desc);

create index user_saved_ai_recipe_cooked_batches_source_recipe_idx
  on public.user_saved_ai_recipe_cooked_batches(source_recipe_id)
  where source_recipe_id is not null;

create or replace function public.prevent_cooked_batch_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501', message = 'Cooked batch owner cannot be changed';
  end if;
  return new;
end;
$$;

create trigger prevent_user_saved_ai_recipe_cooked_batch_owner_change
before update of user_id on public.user_saved_ai_recipe_cooked_batches
for each row execute function public.prevent_cooked_batch_owner_change();

create trigger set_user_saved_ai_recipe_cooked_batches_updated_at
before update on public.user_saved_ai_recipe_cooked_batches
for each row execute function public.set_updated_at();

alter table public.user_saved_ai_recipe_cooked_batches enable row level security;
alter table public.user_saved_ai_recipe_cooked_batches force row level security;

create policy "Users can view own saved recipe cooked batches"
  on public.user_saved_ai_recipe_cooked_batches
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_saved_ai_recipe_cooked_batches from anon;
revoke all on table public.user_saved_ai_recipe_cooked_batches from authenticated;
grant select on table public.user_saved_ai_recipe_cooked_batches to authenticated;

revoke execute on function public.prevent_cooked_batch_owner_change() from public;
revoke execute on function public.prevent_cooked_batch_owner_change() from anon;
revoke execute on function public.prevent_cooked_batch_owner_change() from authenticated;
