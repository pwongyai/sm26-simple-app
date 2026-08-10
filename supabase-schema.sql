-- SM26 Simple App — minimal schema
-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).

-- 1. Profiles: one row per signed-up user, carries role + display name.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('farmer', 'contractor')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any signed-in user"
  on profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- 2. Auto-create a profile row right after signup, from the metadata
--    passed in supabase.auth.signUp({ options: { data: { name, role } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Unnamed'),
    coalesce(new.raw_user_meta_data->>'role', 'farmer')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Requests: the one piece of real logic — a farmer asks for work,
--    a contractor accepts it and marks it done.
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references profiles(id) on delete cascade,
  contractor_id uuid references profiles(id) on delete set null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'done')),
  created_at timestamptz not null default now()
);

alter table requests enable row level security;

create policy "requests are readable by any signed-in user"
  on requests for select
  to authenticated
  using (true);

create policy "farmers can create their own requests"
  on requests for insert
  to authenticated
  with check (auth.uid() = farmer_id);

create policy "contractors can accept or complete requests"
  on requests for update
  to authenticated
  using (true)
  with check (true);
