-- Let Sora log straight into the cockpit's purchase table
alter table public.purchase
  add column if not exists source    text not null default 'dashboard',
  add column if not exists raw_input text;

create index if not exists purchase_source_created_idx
  on public.purchase (source, created_at desc);
