-- PulseAMS schema for Supabase (Postgres)
-- Run this in Supabase Studio → SQL Editor, or via `supabase db push`.
--
-- This schema assumes you've enabled Firebase Auth as a Supabase
-- "Third-Party Auth" provider (see README → "Wire Firebase into Supabase").
-- Once that's configured, auth.jwt() ->> 'sub' resolves to the Firebase user's UID (a plain string, not a Postgres uuid)
-- for any request made with a Firebase ID token, and auth.jwt() ->> 'email'
-- gives you their email.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists employees (
  id text primary key,                 -- e.g. 'EMP-1001'
  name text not null,
  dept text not null,
  role text not null default 'Staff',
  color text not null default '#6366F1',
  face_enrolled boolean not null default false,
  finger_enrolled boolean not null default false,
  fp_credential_id text,               -- WebAuthn credential id (base64url)
  status text not null default 'Active',
  joined date not null default current_date
);

create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on delete cascade,
  date date not null default current_date,
  checkpoint text not null check (checkpoint in ('morning', 'pre_lunch', 'post_lunch', 'end_of_day')),
  time text not null,                  -- 'HH:MM', local kiosk time
  method text not null check (method in ('face', 'fingerprint')),
  device text not null,
  late boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, date, checkpoint)
);

create table if not exists devices (
  id text primary key,
  name text not null,
  type text not null check (type in ('phone', 'pc')),
  location text not null,
  active boolean not null default true
);

-- Maps a Firebase UID to a role and (for employees) their employee row.
-- One row per user who is allowed to sign in.
create table if not exists profiles (
  id text primary key,                 -- Firebase UID
  email text not null,
  role text not null check (role in ('admin', 'hr', 'employee')),
  employee_id text references employees(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------

alter table employees enable row level security;
alter table attendance_logs enable row level security;
alter table devices enable row level security;
alter table profiles enable row level security;

-- Helper: current caller's role, or null if not signed in / no profile.
create or replace function current_role_name() returns text
language sql stable as $$
  select role from profiles where id = (auth.jwt() ->> 'sub')
$$;

-- employees --------------------------------------------------------------
-- The kiosk runs unauthenticated (it's a shared physical terminal), so it
-- needs to read the roster to let people find their name and check
-- enrollment flags. Only the minimum columns are meaningfully public;
-- restrict what an anon client can select with a view if you want to hide
-- fp_credential_id from the kiosk network payload (see README notes).
create policy "anyone can read employees for kiosk lookup"
  on employees for select
  using (true);

create policy "admin/hr manage employees"
  on employees for all
  using (current_role_name() in ('admin', 'hr'))
  with check (current_role_name() in ('admin', 'hr'));

create policy "employee can update own biometric enrollment"
  on employees for update
  using (id = (select employee_id from profiles where id = (auth.jwt() ->> 'sub')))
  with check (id = (select employee_id from profiles where id = (auth.jwt() ->> 'sub')));

-- attendance_logs ----------------------------------------------------------
create policy "anyone can insert attendance from kiosk"
  on attendance_logs for insert
  with check (true);

create policy "admin/hr read all attendance"
  on attendance_logs for select
  using (current_role_name() in ('admin', 'hr'));

create policy "employee reads own attendance"
  on attendance_logs for select
  using (employee_id = (select employee_id from profiles where id = (auth.jwt() ->> 'sub')));

-- devices --------------------------------------------------------------
create policy "anyone can read devices"
  on devices for select
  using (true);

create policy "admin manages devices"
  on devices for all
  using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- profiles --------------------------------------------------------------
create policy "user reads own profile"
  on profiles for select
  using (id = (auth.jwt() ->> 'sub'));

create policy "admin manages profiles"
  on profiles for all
  using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- ---------------------------------------------------------------------
-- Seed data (optional — remove or edit before going live)
-- ---------------------------------------------------------------------

insert into devices (id, name, type, location, active) values
  ('D1', 'Lobby Kiosk', 'phone', 'Main Entrance', true),
  ('D2', 'Floor 2 Sensor', 'pc', 'Engineering Wing', true),
  ('D3', 'Floor 3 Sensor', 'pc', 'Sales Wing', false)
on conflict (id) do nothing;

insert into employees (id, name, dept, role, color, joined) values
  ('EMP-1001', 'Amara Osei', 'Engineering', 'Team Lead', '#6366F1', current_date),
  ('EMP-1002', 'Liam Chen', 'Operations', 'Staff', '#F59E0B', current_date),
  ('EMP-1003', 'Priya Nair', 'Sales', 'Staff', '#10B981', current_date)
on conflict (id) do nothing;

-- After creating your first Firebase user for yourself, add a matching
-- admin profile row (replace the id with the real Firebase UID):
-- insert into profiles (id, email, role) values ('<firebase-uid>', 'you@company.com', 'admin');
