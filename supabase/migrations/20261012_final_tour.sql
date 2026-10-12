-- BabyName: final tournament tables and RLS policies.
-- Apply after 20261012_room_favorites.sql if the app uses room favorites to select candidates.
-- Additive migration: does not modify or delete the normal public.votes table.
-- Safe to re-run: tables are retained; policies below are recreated.

create table if not exists public.final_tours (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.final_tour_votes (
  tour_id uuid not null references public.final_tours(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  left_name text not null,
  left_gender text not null check (left_gender in ('boy', 'girl')),
  right_name text not null,
  right_gender text not null check (right_gender in ('boy', 'girl')),
  choice text not null check (choice in ('left', 'right', 'tie')),
  updated_at timestamptz not null default now(),
  primary key (tour_id, user_id, left_name, left_gender, right_name, right_gender)
);

alter table public.final_tours enable row level security;
alter table public.final_tour_votes enable row level security;

-- Recreate only these migration-owned policies. No tables or rows are dropped.
drop policy if exists "Members read final tours" on public.final_tours;
drop policy if exists "Members create final tours" on public.final_tours;
drop policy if exists "Members read final tour votes" on public.final_tour_votes;
drop policy if exists "Members save own final tour votes" on public.final_tour_votes;
drop policy if exists "Members update own final tour votes" on public.final_tour_votes;
drop policy if exists "Members delete own final tour votes" on public.final_tour_votes;

create policy "Members read final tours"
  on public.final_tours for select to authenticated
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = final_tours.room_id and m.user_id = auth.uid()
    )
  );

create policy "Members create final tours"
  on public.final_tours for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.room_members m
      where m.room_id = final_tours.room_id and m.user_id = auth.uid()
    )
  );

create policy "Members read final tour votes"
  on public.final_tour_votes for select to authenticated
  using (
    exists (
      select 1
      from public.final_tours t
      join public.room_members m on m.room_id = t.room_id
      where t.id = final_tour_votes.tour_id and m.user_id = auth.uid()
    )
  );

create policy "Members save own final tour votes"
  on public.final_tour_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.final_tours t
      join public.room_members m on m.room_id = t.room_id
      where t.id = final_tour_votes.tour_id and m.user_id = auth.uid()
    )
  );

create policy "Members update own final tour votes"
  on public.final_tour_votes for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.final_tours t
      join public.room_members m on m.room_id = t.room_id
      where t.id = final_tour_votes.tour_id and m.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.final_tours t
      join public.room_members m on m.room_id = t.room_id
      where t.id = final_tour_votes.tour_id and m.user_id = auth.uid()
    )
  );

create policy "Members delete own final tour votes"
  on public.final_tour_votes for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.final_tours t
      join public.room_members m on m.room_id = t.room_id
      where t.id = final_tour_votes.tour_id and m.user_id = auth.uid()
    )
  );
