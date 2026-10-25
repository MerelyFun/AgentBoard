import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { PROJECTS, type BoardSnapshot } from '../domain/board';
import { createDemoSnapshot } from './demo';
import { cloudConfig } from './cloud-config';
import { CloudBoard, readSnapshot } from './cloud';

const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
const snapshot = (): BoardSnapshot => ({ projects: PROJECTS.map((p) => ({ ...p })), runs: [], events: [] });
const session = (id = 'viewer'): Session => ({ user: { id }, access_token: `access-${id}`, refresh_token: `refresh-${id}` }) as Session;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function harness(initial: Session | null = session()) {
  let authCallback: ((event: string, session: Session | null) => void) | undefined;
  let subscribeCallback: ((status: string) => void) | undefined;
  const changes: (() => void)[] = [];
  const unsubscribe = vi.fn();
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: () => void) => { changes.push(callback); return channel; }),
    subscribe: vi.fn((callback: (status: string) => void) => { subscribeCallback = callback; return channel; }),
  };
  const responses: Promise<{ data: unknown; error: unknown }>[] = [];
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      onAuthStateChange: vi.fn((callback: typeof authCallback) => { authCallback = callback; return { data: { subscription: { unsubscribe } } }; }),
      setSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
    rpc: vi.fn(() => ({ abortSignal: vi.fn(() => responses.shift() ?? Promise.resolve({ data: snapshot(), error: null })) })),
  };
  const board = new CloudBoard(client as unknown as SupabaseClient, config);
  boards.push(board);
  const listener = vi.fn();
  return { board, listener, client, responses, unsubscribe,
    start: () => board.start(listener),
    auth: (event: string, next: Session | null) => authCallback?.(event, next),
    realtime: (status: string) => subscribeCallback?.(status),
    change: () => changes.forEach((callback) => callback()),
  };
}

let boards: CloudBoard[] = [];
let browserEvents: EventTarget;
let online: { onLine: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  browserEvents = new EventTarget();
  online = { onLine: true };
  vi.stubGlobal('window', browserEvents);
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('navigator', online);
});
afterEach(() => {
  boards.forEach((board) => board.stop()); boards = [];
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('public cloud configuration and response boundaries', () => {
  it('only accepts an HTTPS URL and a publishable key', () => {
    expect(cloudConfig({ VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey })).toEqual(config);
    for (const url of ['', 'http://example.supabase.co', 'https://user:secret@example.supabase.co', `${config.url}/?secret=x`]) {
      expect(cloudConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey })).toBeNull();
    }
    for (const key of ['', 'sb_secret_wrong', 'eyJ.service-role']) {
      expect(cloudConfig({ VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toBeNull();
    }
  });
  it('accepts the real empty board but rejects malformed data instead of showing an empty success', () => {
    expect(readSnapshot(snapshot())).toEqual(snapshot());
    expect(readSnapshot({ projects: [], runs: [], events: [] })).toEqual({ projects: [], runs: [], events: [] });
    expect(() => readSnapshot({ ...snapshot(), runs: [{ id: 'bad' }] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...snapshot(), projects: [PROJECTS[0], PROJECTS[0], PROJECTS[1]] })).toThrow(/数据格式异常/);
  });

  it.each([['game-systems-designer', '玩法策划'], ['game-balance-designer', '数值策划']] as const)('accepts %s cloud submissions without treating them as acceptance', (role, label) => {
    const demo = createDemoSnapshot();
    const run = { ...demo.runs[0], role, label, lead: false, status: 'submitted' as const };
    const event = { ...demo.events[0], projectId: run.projectId, runId: run.id, role, kind: 'submitted' };
    const data = { projects: demo.projects, runs: [run], events: [event] };
    expect(readSnapshot(data)).toEqual(data);
    expect(readSnapshot(data).runs[0]).toMatchObject({ role, status: 'submitted', lead: false });
    expect(readSnapshot(data).runs[0].verdict).toBeUndefined();
  });

  it('accepts one or many projects from the response without adding known projects', () => {
    const projects = Array.from({ length: 7 }, (_, i) => ({ id: `project-${i}`, name: `Project ${i}`, gameName: `游戏 ${i}` }));
    const demo = createDemoSnapshot();
    const run = { ...demo.runs[0], projectId: projects[0].id };
    const event = { ...demo.events[0], projectId: projects[0].id, runId: run.id, role: run.role };
    for (const selected of [projects.slice(0, 1), projects]) {
      const data = { projects: selected, runs: [run], events: [event] };
      expect(readSnapshot(data)).toEqual(data);
      expect(readSnapshot(data).projects.some((project) => project.id === '3match')).toBe(false);
    }
  });

  it.each(['', ' ', ' new-project', 'new-project ', 'new\nproject', 'all', 'a'.repeat(201), 123, null])('rejects malformed project ID %j', (id) => {
    expect(() => readSnapshot({ projects: [{ ...PROJECTS[0], id }], runs: [], events: [] })).toThrow(/数据格式异常/);
  });

  it('rejects missing project references and duplicate or empty record IDs', () => {
    const data = createDemoSnapshot();
    expect(() => readSnapshot({ ...data, projects: [] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, runs: [{ ...data.runs[0], projectId: 'missing-project' }] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, events: [{ ...data.events[0], projectId: 'missing-project' }] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, runs: [data.runs[0], data.runs[0]] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, events: [data.events[0], data.events[0]] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, runs: [{ ...data.runs[0], id: '' }] })).toThrow(/数据格式异常/);
    expect(() => readSnapshot({ ...data, events: [{ ...data.events[0], id: ' ' }] })).toThrow(/数据格式异常/);
  });
});

describe('authenticated snapshot and Realtime lifecycle', () => {
  it('does not query or subscribe until authenticated', async () => {
    const h = harness(null); h.start(); await flush();
    expect(h.board.state.phase).toBe('signed-out');
    expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.client.channel).not.toHaveBeenCalled();
    h.board.stop();
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    browserEvents.dispatchEvent(new Event('focus'));
    expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it('reads again after subscribe succeeds, closing the initial snapshot race', async () => {
    const h = harness();
    const pending = deferred<{ data: unknown; error: unknown }>();
    h.responses.push(pending.promise);
    h.start(); await flush();
    expect(h.client.rpc).toHaveBeenCalledTimes(1);
    h.realtime('SUBSCRIBED');
    pending.resolve({ data: snapshot(), error: null }); await flush();
    expect(h.client.rpc).toHaveBeenCalledTimes(2);
    expect(h.board.state).toMatchObject({ phase: 'live', snapshot: snapshot(), error: '' });
  });
  it('debounces a burst of project, run, and event changes into one read and stops on source switch', async () => {
    const h = harness(); const stop = h.start(); await flush(); h.realtime('SUBSCRIBED'); await flush();
    h.client.rpc.mockClear();
    h.change(); h.change();
    await vi.advanceTimersByTimeAsync(180);
    expect(h.client.rpc).toHaveBeenCalledOnce();
    stop(); h.client.rpc.mockClear();
    h.change(); browserEvents.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.client.rpc).not.toHaveBeenCalled();
    expect(h.client.removeChannel).toHaveBeenCalled();
  });
  it('keeps the last successful snapshot on network error and clearly reports disconnection', async () => {
    const h = harness(); h.start(); await flush(); h.realtime('SUBSCRIBED'); await flush();
    const lastSyncedAt = h.board.state.lastSyncedAt;
    h.responses.push(Promise.resolve({ data: null, error: { message: 'failed fetch' } }));
    await h.board.refresh();
    expect(h.board.state).toMatchObject({ phase: 'error', snapshot: snapshot(), lastSyncedAt });
    online.onLine = false; browserEvents.dispatchEvent(new Event('offline'));
    expect(h.board.state.phase).toBe('offline'); expect(h.board.state.error).toContain('网络已断开');
    h.client.rpc.mockClear(); await h.board.refresh();
    expect(h.client.rpc).not.toHaveBeenCalled();
    online.onLine = true; browserEvents.dispatchEvent(new Event('online')); await flush();
    expect(h.board.state.phase).toBe('live');
  });
  it('ignores a delayed private response after logout and clears cached private data', async () => {
    const h = harness(); h.start(); await flush();
    const pending = deferred<{ data: unknown; error: unknown }>(); h.responses.push(pending.promise);
    const refresh = h.board.refresh();
    await h.board.logout();
    pending.resolve({ data: snapshot(), error: null }); await refresh;
    expect(h.board.state).toMatchObject({ phase: 'signed-out', userId: null, snapshot: null, lastSyncedAt: null });
    expect(h.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('ignores an old user response when another session takes over', async () => {
    const h = harness();
    const pending = deferred<{ data: unknown; error: unknown }>(); h.responses.push(pending.promise);
    h.start(); await flush();
    h.auth('SIGNED_IN', session('another-viewer')); await flush();
    const successful = h.board.state.snapshot;
    pending.resolve({ data: { invalid: 'old-user-data' }, error: null }); await flush();
    expect(h.board.state.userId).toBe('another-viewer');
    expect(h.board.state.snapshot).toBe(successful);
    expect(h.board.state.phase).not.toBe('error');
  });
  it('drops private data when RLS denies membership instead of keeping an apparently successful view', async () => {
    const h = harness(); h.start(); await flush();
    h.responses.push(Promise.resolve({ data: null, error: { code: '42501', message: 'no access' } }));
    await h.board.refresh();
    expect(h.board.state).toMatchObject({ phase: 'signed-out', snapshot: null, userId: null });
    expect(h.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('does not revive a stopped connection when restoring a stored session completes late', async () => {
    const h = harness();
    const pending = deferred<{ data: { session: Session }; error: null }>();
    h.client.auth.getSession.mockImplementationOnce(() => pending.promise);
    h.start(); h.board.stop();
    const calls = h.listener.mock.calls.length;
    pending.resolve({ data: { session: session() }, error: null }); await flush();
    expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.listener).toHaveBeenCalledTimes(calls);
  });
});

describe('access code authentication', () => {
  it('exchanges the code over HTTPS and persists only the returned Auth session', async () => {
    const h = harness(null);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ access_token: 'returned-access', refresh_token: 'returned-refresh' })));
    vi.stubGlobal('fetch', fetch);
    await h.board.login('  one-time-input  ');
    expect(fetch).toHaveBeenCalledWith(`${config.url}/functions/v1/agentboard-access`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ access_code: 'one-time-input' }), headers: { 'Content-Type': 'application/json', apikey: config.publishableKey },
    }));
    expect(h.client.auth.setSession).toHaveBeenCalledWith({ access_token: 'returned-access', refresh_token: 'returned-refresh' });
  });
  it('rejects an invalid code without creating an Auth session', async () => {
    const h = harness(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(h.board.login('invalid')).rejects.toThrow('访问码不正确');
    expect(h.client.auth.setSession).not.toHaveBeenCalled();
  });
});
