import { serviceClient } from '../_shared/client.ts';
import { allowedOrigin, readJson, respond } from '../_shared/http.ts';
import { sha256, validateReport, writerAllows } from '../_shared/protocol.ts';

Deno.serve(async (request) => {
  if (!allowedOrigin(request)) return respond(request, 403, { error: 'origin_not_allowed' });
  if (request.method === 'OPTIONS') return respond(request, 204, null);
  if (request.method !== 'POST') return respond(request, 405, { error: 'method_not_allowed' });
  const token = request.headers.get('x-agentboard-token');
  if (!token || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return respond(request, 401, { error: 'unauthorized' });
  try {
    const client = serviceClient(), tokenHash = await sha256(token);
    const writer = await client.rpc('agentboard_writer', { p_token_hash: tokenHash });
    if (writer.error) return respond(request, 503, { error: 'temporarily_unavailable' });
    if (!writer.data) return respond(request, 401, { error: 'unauthorized' });
    let event;
    try { event = validateReport(await readJson(request, 256 * 1024)); }
    catch { return respond(request, 400, { error: 'invalid_report' }); }
    if (!writerAllows(event, writer.data)) return respond(request, 403, { error: 'writer_scope_mismatch' });
    const result = await client.rpc('agentboard_ingest', { p_event: event, p_token_hash: tokenHash });
    if (result.error) {
      const conflict = result.error.code === '23505' || result.error.code === '23514';
      return respond(request, conflict ? 409 : 503, { error: conflict ? 'event_context_conflict' : 'temporarily_unavailable' });
    }
    return respond(request, 200, result.data);
  } catch { return respond(request, 503, { error: 'temporarily_unavailable' }); }
});
