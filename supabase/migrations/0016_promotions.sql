-- Módulo «Promociones»: campañas que el visitante ve justo después de conectarse, segmentadas por su historial de visitas.
-- Solo las escribe el servidor; los administradores del establecimiento leen. No guardan datos personales: los eventos son agregados.
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  segment text not null default 'all' check (segment in ('all', 'new', 'returning', 'inactive')),
  inactive_days integer not null default 30 check (inactive_days between 7 and 365),
  content jsonb not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists promotions_tenant on promotions (tenant_id, status);

create table if not exists promotion_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  promotion_id uuid not null references promotions(id) on delete cascade,
  kind text not null check (kind in ('impression', 'click')),
  created_at timestamptz not null default now()
);
create index if not exists promotion_events_promo on promotion_events (promotion_id, kind, created_at);

alter table promotions enable row level security;
alter table promotion_events enable row level security;
revoke all on promotions, promotion_events from anon, authenticated;
revoke all on sequence promotion_events_id_seq from anon, authenticated;
grant select on promotions, promotion_events to authenticated;

drop policy if exists promotions_admin_select on promotions;
create policy promotions_admin_select on promotions for select
  using (tenant_id = current_tenant() and is_admin());
drop policy if exists promotion_events_admin_select on promotion_events;
create policy promotion_events_admin_select on promotion_events for select
  using (tenant_id = current_tenant() and is_admin());
