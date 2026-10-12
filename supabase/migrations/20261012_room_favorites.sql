-- Review and run manually in Supabase SQL Editor. Existing tables and policies are untouched.
create table if not exists public.room_favorites (
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  gender text not null check (gender in ('boy','girl')),
  note text not null default '' check (char_length(note) <= 280),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id,name,gender)
);
alter table public.room_favorites enable row level security;
create policy "Members read final favorites" on public.room_favorites for select to authenticated using (exists (select 1 from public.room_members m where m.room_id=room_favorites.room_id and m.user_id=auth.uid()));
create policy "Members add final favorites" on public.room_favorites for insert to authenticated with check (created_by=auth.uid() and exists (select 1 from public.room_members m where m.room_id=room_favorites.room_id and m.user_id=auth.uid()));
create policy "Members delete final favorites" on public.room_favorites for delete to authenticated using (exists (select 1 from public.room_members m where m.room_id=room_favorites.room_id and m.user_id=auth.uid()));
