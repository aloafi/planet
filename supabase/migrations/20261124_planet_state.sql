-- Planet: one document per user holding their whole app state (plan, templates, day progress, history, settings)
create table public.planet_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.planet_state enable row level security;

create policy "planet_state: read own" on public.planet_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "planet_state: insert own" on public.planet_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "planet_state: update own" on public.planet_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "planet_state: delete own" on public.planet_state
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.planet_state add constraint planet_state_size check (pg_column_size(state) < 2000000);

create or replace function public.planet_state_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger planet_state_touch before update on public.planet_state
  for each row execute function public.planet_state_touch();
