import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { PROJECTS, ROLE_LABELS, STATUS_LABELS, type BoardSnapshot } from '../domain/board';
import type { CloudConfig } from './cloud-config';

export type CloudPhase = 'signed-out' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error';
export interface CloudState {
  phase: CloudPhase;
  snapshot: BoardSnapshot | null;
  userId: string | null;
  lastSyncedAt: number | null;
  error: string;
}
export const INITIAL_CLOUD_STATE: CloudState = { phase: 'connecting', snapshot: null, userId: null, lastSyncedAt: null, error: '' };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const stage = (value: unknown) => record(value) && string(value.id) && string(value.name);
const projectIds = new Set(PROJECTS.map((project) => project.id as string));
const evidence = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(string));

/** Reject malformed responses before they can be mistaken for a valid empty board. */
export function readSnapshot(value: unknown): BoardSnapshot {
  if (!record(value) || !Array.isArray(value.projects) || !Array.isArray(value.runs) || !Array.isArray(value.events)) throw new Error('云端数据格式异常，请重试。');
  const projects = value.projects.every((p) => record(p) && projectIds.has(String(p.id)) && string(p.name) && string(p.gameName) && (p.stage === undefined || stage(p.stage)) && (p.step === undefined || stage(p.step)));
  const runs = value.runs.every((r) => record(r) && string(r.id) && projectIds.has(String(r.projectId)) && string(r.role) && Object.hasOwn(ROLE_LABELS, r.role) && string(r.label) && string(r.task) && stage(r.stage) && stage(r.step) && string(r.status) && Object.hasOwn(STATUS_LABELS, r.status) && string(r.lastReportedAt) && Number.isFinite(Date.parse(r.lastReportedAt)) && string(r.summary) && evidence(r.evidence));
  const events = value.events.every((e) => record(e) && string(e.id) && projectIds.has(String(e.projectId)) && string(e.role) && Object.hasOwn(ROLE_LABELS, e.role) && string(e.kind) && string(e.summary) && string(e.at) && Number.isFinite(Date.parse(e.at)) && evidence(e.evidence));
  if (!projects || !runs || !events || value.projects.length !== 3 || new Set(value.projects.map((p) => p.id)).size !== 3) throw new Error('云端数据格式异常，请重试。');
  return value as unknown as BoardSnapshot;
}

export class CloudBoard {
  state: CloudState = { ...INITIAL_CLOUD_STATE };
  private active = false;
  private epoch = 0;
  private request = 0;
  private channel: RealtimeChannel | null = null;
  private authSubscription: { unsubscribe(): void } | null = null;
  private listener: ((state: CloudState) => void) | null = null;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private fallback: ReturnType<typeof setInterval> | undefined;
  private subscribed = false;
  private fetching = false;
  private needsRefresh = false;
  private focus = () => { void this.refresh(); };
  private online = () => { this.update({ phase: 'reconnecting', error: '' }); void this.refresh(); };
  private offline = () => this.update({ phase: 'offline', error: '网络已断开，正在显示上次成功同步的数据。' });

  constructor(private client: SupabaseClient, private config: CloudConfig) {}

  private update(patch: Partial<CloudState>) {
    this.state = { ...this.state, ...patch };
    if (this.active) this.listener?.(this.state);
  }

  start(listener: (state: CloudState) => void) {
    this.stop();
    this.active = true;
    this.listener = listener;
    const epoch = this.epoch;
    this.update({ phase: 'connecting', error: '' });
    this.authSubscription = this.client.auth.onAuthStateChange((event, session) => {
      // Supabase auth callbacks run under a lock. Defer all client calls.
      if (event !== 'INITIAL_SESSION') queueMicrotask(() => { if (this.active && epoch === this.epoch) this.sessionChanged(session); });
    }).data.subscription;
    void this.client.auth.getSession().then(({ data, error }) => {
      if (!this.active || epoch !== this.epoch) return;
      if (error) this.update({ phase: 'signed-out', snapshot: null, userId: null, lastSyncedAt: null, error: '登录已失效，请重新登录。' });
      else this.sessionChanged(data.session);
    }).catch(() => { if (this.active && epoch === this.epoch) this.update({ phase: 'error', error: '无法恢复登录，请重试。' }); });
    window.addEventListener('focus', this.focus);
    window.addEventListener('online', this.online);
    window.addEventListener('offline', this.offline);
    this.fallback = setInterval(() => { if (document.visibilityState !== 'hidden') void this.refresh(); }, 30_000);
    return () => { if (epoch === this.epoch) this.stop(); };
  }

  stop() {
    this.active = false;
    this.epoch++;
    this.request++;
    this.fetching = false;
    this.needsRefresh = false;
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    this.clearChannel();
    clearTimeout(this.debounce);
    clearInterval(this.fallback);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('online', this.online);
    window.removeEventListener('offline', this.offline);
    this.listener = null;
  }

  private clearChannel() {
    this.subscribed = false;
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }

  private sessionChanged(session: Session | null) {
    if (!session) {
      this.request++;
      this.fetching = false;
      this.clearChannel();
      this.update({ phase: 'signed-out', userId: null, snapshot: null, lastSyncedAt: null, error: '' });
      return;
    }
    if (this.state.userId === session.user.id && this.channel) return;
    this.clearChannel();
    const sameUser = this.state.userId === session.user.id;
    this.request++;
    this.fetching = false;
    this.needsRefresh = false;
    this.update({ userId: session.user.id, phase: 'connecting', error: '', ...(!sameUser ? { snapshot: null, lastSyncedAt: null } : {}) });
    const epoch = this.epoch;
    let channel = this.client.channel(`agentboard-${session.user.id}`);
    for (const table of ['agentboard_runs', 'agentboard_projects', 'agentboard_events']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { if (this.active && epoch === this.epoch) void this.refresh(); }, 180);
      });
    }
    this.channel = channel;
    channel.subscribe((status) => {
      if (!this.active || epoch !== this.epoch || this.channel !== channel) return;
      this.subscribed = status === 'SUBSCRIBED';
      if (this.subscribed) void this.refresh(); // Fetch again after subscribe to close the initial-query race.
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') this.update({ phase: navigator.onLine ? 'reconnecting' : 'offline', error: '实时连接中断，正在重连；每 30 秒尝试同步。' });
    });
    void this.refresh();
  }

  async refresh() {
    if (!this.active || !this.state.userId) return;
    if (!navigator.onLine) { this.offline(); return; }
    if (this.fetching) { this.needsRefresh = true; return; }
    this.fetching = true;
    const epoch = this.epoch;
    const request = ++this.request;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const { data, error } = await this.client.rpc('agentboard_snapshot').abortSignal(controller.signal);
      if (!this.active || epoch !== this.epoch || request !== this.request) return;
      if (error) throw error;
      const snapshot = readSnapshot(data);
      this.update({ snapshot, lastSyncedAt: Date.now(), phase: this.subscribed ? 'live' : 'reconnecting', error: this.subscribed ? '' : '实时连接尚未恢复；每 30 秒尝试同步。' });
    } catch (error) {
      if (!this.active || epoch !== this.epoch || request !== this.request) return;
      const code = record(error) ? error.code : '';
      if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') {
        this.clearChannel();
        this.update({ phase: 'signed-out', snapshot: null, userId: null, lastSyncedAt: null, error: '登录已失效或无权查看，请重新登录。' });
        void this.client.auth.signOut({ scope: 'local' });
      } else this.update({ phase: navigator.onLine ? 'error' : 'offline', error: error instanceof Error ? error.message : '同步失败，正在保留上次成功同步的数据。' });
    } finally {
      clearTimeout(timeout);
      if (epoch === this.epoch && request === this.request) {
        this.fetching = false;
        if (this.needsRefresh) { this.needsRefresh = false; void this.refresh(); }
      }
    }
  }

  async login(accessCode: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${this.config.url}/functions/v1/agentboard-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.config.publishableKey },
        body: JSON.stringify({ access_code: accessCode.trim() }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 ? '访问码不正确。' : response.status === 429 ? '尝试过于频繁，请稍后重试。' : '暂时无法登录，请稍后重试。');
      const tokens: unknown = await response.json();
      if (!record(tokens) || !string(tokens.access_token) || !string(tokens.refresh_token)) throw new Error('登录响应异常，请重试。');
      const { data, error } = await this.client.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
      if (error || !data.session) throw new Error('无法保存登录，请重试。');
      if (this.active) this.sessionChanged(data.session);
    } catch (error) {
      if (error instanceof Error && !['TypeError', 'AbortError'].includes(error.name)) throw error;
      throw new Error('网络连接失败，请检查网络后重试。');
    } finally { clearTimeout(timer); }
  }

  async logout() {
    // Clear cached private data immediately, even if the network is unavailable.
    this.sessionChanged(null);
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('退出未完成，请重试。');
  }
}

export function createCloudBoard(config: CloudConfig) {
  return new CloudBoard(createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }), config);
}
