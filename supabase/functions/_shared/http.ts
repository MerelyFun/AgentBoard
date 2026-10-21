const ORIGINS = new Set(['http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://localhost:5173', 'http://localhost:4173', 'https://merelyfun.github.io', 'https://xn--hyvt5k.club']);
export function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin === null || ORIGINS.has(origin);
}
export function respond(request: Request, status: number, data: unknown): Response {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
  };
  if (origin && ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info, x-agentboard-token';
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}
/** Read with an enforced byte limit, including requests without Content-Length. */
export async function readJson(request: Request, limit: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('invalid_content_type');
  if (Number(request.headers.get('content-length')) > limit) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      length += result.value.length;
      if (length > limit) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
/** Defense in depth; high-entropy credentials remain the authentication boundary. */
const attempts = new Map<string, { count: number; until: number }>();
export function rateLimited(request: Request, limit = 20): boolean {
  const now = Date.now(), key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (attempts.size > 10000) for (const [id, item] of attempts) if (item.until <= now) attempts.delete(id);
  const entry = attempts.get(key);
  if (!entry && attempts.size >= 10000) return true;
  if (!entry || entry.until <= now) { attempts.set(key, { count: 1, until: now + 60000 }); return false; }
  return ++entry.count > limit;
}
