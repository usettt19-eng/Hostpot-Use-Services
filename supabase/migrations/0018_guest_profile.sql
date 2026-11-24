-- Módulo «Preguntas al visitante»: respuestas opcionales del visitante (residente o turista, tiempo de estancia, motivo…).
-- Se puede ejecutar más de una vez. Pégalo COMPLETO en el SQL Editor.
-- Las respuestas viven en guests.profile (jsonb: {"residence": "resident", "stay": "week"}), validadas por la aplicación contra
-- un catálogo fijo de preguntas (lib/guest-questions.ts). Las lee el administrador del establecimiento (la política de guests
-- ya existe) y las escribe solo el servidor. Se borran con el visitante (cascada).
alter table guests add column if not exists profile jsonb not null default '{}'::jsonb;
alter table guests drop constraint if exists guests_profile_is_object;
alter table guests add constraint guests_profile_is_object check (jsonb_typeof(profile) = 'object');

-- Público de una promoción según las respuestas: {"q": "residence", "in": ["resident"]}; null = para todos
alter table promotions add column if not exists audience jsonb;
alter table promotions drop constraint if exists promotions_audience_shape;
alter table promotions add constraint promotions_audience_shape check (
  audience is null or (
    jsonb_typeof(audience) = 'object' and audience ? 'q' and audience ? 'in' and jsonb_typeof(audience -> 'in') = 'array'
  )
);
