alter table finance_target
  add column if not exists scope text not null default 'personal'
  check (scope in ('personal', 'business'));

-- tax targets are the business's money, not personal saving
update finance_target set scope = 'business' where tracks = 'tax';
