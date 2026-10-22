-- Projects are explicitly registered by an administrator, rather than limited to
-- the three initial seeds. Match JavaScript's 200 UTF-16 code-unit ID limit and
-- its whitespace/control exclusions (Postgres text cannot contain U+0000).
alter table public.agentboard_projects
  drop constraint agentboard_projects_project_id_check,
  add constraint agentboard_projects_project_id_check check (
    char_length(regexp_replace(project_id, U&'[\+010000-\+10FFFF]', 'xx', 'g')) between 1 and 200
    and project_id <> 'all'
    and project_id !~ U&'[\0001-\0020\007F\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
  );

-- A writer keeps exactly its existing role and project_ids. The original default
-- remains compatible with provision.example.sql; new projects require an explicit
-- administrator grant. SQL ingest still checks role + project_ids, and its event/
-- run foreign keys still reject unknown projects. No rows or RLS policies change.
alter table private.agentboard_writers
  drop constraint agentboard_writers_project_ids_check,
  add constraint agentboard_writers_project_ids_check check (
    cardinality(project_ids) > 0 and array_position(project_ids, null) is null
  );
