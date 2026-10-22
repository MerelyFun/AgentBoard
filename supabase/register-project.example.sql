-- Administrative SQL example. Apply the registered_projects migration first.
-- Replace the sample project metadata and the selected writer's SHA-256 hash.
-- Keep raw tokens in ignored local configuration; never paste a token here.
-- Each project ID must be 1–200 UTF-16 code units, contain no whitespace/control
-- characters, and must not be "all". The exact ID must also exist in projects.toml
-- for reporters that use this repository's local project configuration.
begin;

-- Registration alone does not grant any writer access to this project.
insert into public.agentboard_projects(project_id, payload)
values ('your-project-id', jsonb_build_object(
  'id', 'your-project-id',
  'name', 'YourProject',
  'gameName', '项目显示名称',
  'shortName', 'YP',
  'color', '#7C5CFC'
));

-- Grant only this existing writer, retaining its role and all previous projects.
-- Repeat explicitly for any other selected role credential that needs access.
do $$
begin
  update private.agentboard_writers
  set project_ids = array_append(project_ids, 'your-project-id')
  where token_hash = '<selected_writer_sha256_hex>' and not revoked
    and not ('your-project-id' = any(project_ids));
  if not found then
    raise exception 'Selected active writer was not found or already has access';
  end if;
end;
$$;

commit;

-- Alternative for a NEW credential (use instead of the UPDATE block above):
-- insert into private.agentboard_writers(token_hash, role, project_ids)
-- values ('<new_writer_sha256_hex>', 'game-producer', array['your-project-id']);
-- Never grant every writer access implicitly, and never accept an event as
-- registration: reports for an unregistered project fail the database FK gate.
