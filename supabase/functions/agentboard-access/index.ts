import { serviceClient } from '../_shared/client.ts';
import { allowedOrigin, rateLimited, readJson, respond } from '../_shared/http.ts';
import { sha256 } from '../_shared/protocol.ts';

Deno.serve(async (request) => {
  if (!allowedOrigin(request)) return respond(request, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') return respond(request, 204, null);
  if (request.method !== 'POST') return respond(request, 405, { error: 'method_not_allowed' });
  if (rateLimited(request)) return respond(request, 429, { error: 'too_many_attempts' });
  let accessCode: string;
  try {
    const body = await readJson(request, 1024) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || typeof body.access_code !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.access_code)) throw new Error('invalid');
    accessCode = body.access_code;
  } catch { return respond(request, 401, { error: 'invalid_access_code' }); }
  try {
    const client = serviceClient();
    const credential = await client.rpc('agentboard_viewer_credential', { p_token_hash: await sha256(accessCode) });
    if (credential.error) return respond(request, 503, { error: 'temporarily_unavailable' });
    if (!credential.data) return respond(request, 401, { error: 'invalid_access_code' });
    const email: string = credential.data.viewer_email;
    // The address is internal; no email is sent. Only a valid board code reaches admin Auth.
    const created = await client.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && created.error.code !== 'email_exists' && created.error.code !== 'user_already_exists') return respond(request, 503, { error: 'temporarily_unavailable' });
    const link = await client.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.properties?.hashed_token || !link.data.user?.id) return respond(request, 503, { error: 'temporarily_unavailable' });
    const membership = await client.rpc('agentboard_add_viewer', { p_user_id: link.data.user.id, p_token_hash: await sha256(accessCode) });
    if (membership.error || membership.data !== true) return respond(request, 503, { error: 'temporarily_unavailable' });
    const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
    if (verified.error || !verified.data.session) return respond(request, 503, { error: 'temporarily_unavailable' });
    return respond(request, 200, { access_token: verified.data.session.access_token, refresh_token: verified.data.session.refresh_token });
  } catch { return respond(request, 503, { error: 'temporarily_unavailable' }); }
});
