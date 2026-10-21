export interface CloudConfig { url: string; publishableKey: string }

export function cloudConfig(env: Record<string, unknown>): CloudConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : '';
  if (!url || !key || !key.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { url: parsed.origin, publishableKey: key };
  } catch { return null; }
}

export const CLOUD_CONFIG = cloudConfig(import.meta.env);
