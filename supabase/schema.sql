-- Kingdom Code reader accounts: the whole database, in one file.
-- Paste this into Supabase (SQL Editor > New query) and press Run. It is safe to run again.
-- Supabase itself keeps the accounts (auth.users: the email address and nothing else).
-- This file adds one table, `saved`, and one function, `delete_my_account`.

create table if not exists public.saved (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('guide', 'essay', 'verse')),
  item_key   text not null check (char_length(item_key) between 1 and 80 and item_key ~ '^[a-z0-9:_-]+$'),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_key)
);

-- A reader sees and changes only their own rows. Nobody who is signed out can touch the table.
alter table public.saved enable row level security;
revoke all on public.saved from anon, authenticated;
grant select, insert, delete on public.saved to authenticated;

drop policy if exists "read own" on public.saved;
drop policy if exists "save own" on public.saved;
drop policy if exists "unsave own" on public.saved;
create policy "read own"   on public.saved for select to authenticated using (user_id = (select auth.uid()));
create policy "save own"   on public.saved for insert to authenticated with check (user_id = (select auth.uid()));
create policy "unsave own" on public.saved for delete to authenticated using (user_id = (select auth.uid()));

-- A reader may keep up to 2000 saved items: enough for real study, too few to be used as free storage.
create or replace function public.saved_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.saved where user_id = new.user_id) >= 2000 then
    raise exception 'Saved limit reached (2000).';
  end if;
  return new;
end $$;
drop trigger if exists saved_limit on public.saved;
create trigger saved_limit before insert on public.saved for each row execute function public.saved_limit();

-- "Delete my account": removes the signed-in reader's account; their saved rows go with it (on delete cascade above).
-- It can delete only the caller's own account, and only a signed-in caller may run it.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not signed in.'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
