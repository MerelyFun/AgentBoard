-- Run with an administrative SQL connection. Replace ONLY the SHA-256 hashes.
-- Raw credentials belong in ignored local configuration, never in SQL or Git.
insert into private.agentboard_writers(token_hash, role) values
  ('<producer_sha256_hex>', 'game-producer'),
  ('<tech_lead_sha256_hex>', 'game-tech-lead'),
  ('<developer_sha256_hex>', 'game-developer'),
  ('<verifier_sha256_hex>', 'game-verifier');
insert into private.agentboard_access_codes(token_hash, viewer_email)
  values ('<viewer_sha256_hex>', 'agentboard-<random_uuid>@example.invalid');

-- Writer rotation: revoke the old hash, provision a new random token and hash,
-- then replace its role token in .local/transport.json.
-- UPDATE private.agentboard_writers SET revoked = true WHERE token_hash = '<old_hash>';
-- Viewer revocation must also remove its membership (existing JWTs can survive
-- until expiry, whereas membership removal immediately stops RLS reads):
-- UPDATE private.agentboard_access_codes SET revoked = true WHERE token_hash = '<old_hash>';
-- DELETE FROM public.agentboard_viewers WHERE user_id = '<internal_viewer_auth_user_id>';
