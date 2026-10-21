-- Personalización del portal por establecimiento (versiones borrador/publicada/archivada)

create table portal_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  settings jsonb not null,
  -- sube cuando cambian los términos al publicar; los consentimientos apuntan a esta versión
  terms_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, version)
);
create unique index portal_versions_one_published on portal_versions (tenant_id) where status = 'published';
create unique index portal_versions_one_draft on portal_versions (tenant_id) where status = 'draft';

alter table portal_versions enable row level security;
-- Escribe solo el servidor (service role), que valida el contenido; los admins solo leen
revoke all on portal_versions from anon, authenticated;
grant select on portal_versions to authenticated;
create policy portal_versions_admin_select on portal_versions for select
  using (tenant_id = current_tenant() and is_admin());

-- Publicación atómica: archiva la publicada, publica el borrador y calcula la versión de términos
create or replace function publish_portal_version(p_tenant uuid, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  has_prev boolean;
  prev_terms integer;
  prev_settings jsonb;
  new_settings jsonb;
  v_terms integer;
begin
  select settings into new_settings from portal_versions
    where tenant_id = p_tenant and version = p_version and status = 'draft';
  if not found then
    raise exception 'La versión % no es un borrador publicable', p_version;
  end if;

  select terms_version, settings into prev_terms, prev_settings from portal_versions
    where tenant_id = p_tenant and status = 'published';
  has_prev := found;

  if not has_prev then
    v_terms := 1;
  elsif (prev_settings -> 'terms') is distinct from (new_settings -> 'terms') then
    v_terms := prev_terms + 1;
  else
    v_terms := prev_terms;
  end if;

  update portal_versions set status = 'archived' where tenant_id = p_tenant and status = 'published';
  update portal_versions set status = 'published', published_at = now(), terms_version = v_terms
    where tenant_id = p_tenant and version = p_version;
end $$;
revoke execute on function publish_portal_version(uuid, integer) from public, anon, authenticated;
grant execute on function publish_portal_version(uuid, integer) to service_role;

-- Bucket privado para logos y fondos (sin políticas: solo el servidor accede y los sirve)
insert into storage.buckets (id, name, public) values ('portal-assets', 'portal-assets', false)
  on conflict (id) do nothing;
