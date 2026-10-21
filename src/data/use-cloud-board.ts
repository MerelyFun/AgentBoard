import { useEffect, useState } from 'react';
import { CLOUD_CONFIG } from './cloud-config';
import type { CloudBoard, CloudState } from './cloud';

const initial: CloudState = { phase: 'connecting', snapshot: null, userId: null, lastSyncedAt: null, error: '' };
let service: Promise<CloudBoard> | null = null;
function getService(): Promise<CloudBoard> {
  if (!CLOUD_CONFIG) return Promise.reject(new Error('尚未配置云端连接。'));
  const config = CLOUD_CONFIG;
  return service ??= import('./cloud').then(({ createCloudBoard }) => createCloudBoard(config));
}

export function useCloudBoard(active: boolean) {
  const [state, setState] = useState<CloudState>(initial);
  useEffect(() => {
    if (!active || !CLOUD_CONFIG) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void getService().then((board) => { if (!disposed) stop = board.start(setState); }).catch(() => {
      if (!disposed) setState({ ...initial, phase: 'error', error: '云端连接加载失败，请刷新页面。' });
    });
    return () => { disposed = true; stop?.(); };
  }, [active]);
  return {
    ...state,
    configured: !!CLOUD_CONFIG,
    login: async (code: string) => (await getService()).login(code),
    logout: async () => {
      const board = await getService();
      try { await board.logout(); }
      finally { setState({ ...board.state }); }
    },
    retry: async () => {
      try { const board = await getService(); if (board.state.userId) await board.refresh(); else setState({ ...board.state, phase: 'signed-out' }); }
      catch { setState((previous) => ({ ...previous, phase: 'error', error: '连接加载失败，请刷新页面。' })); }
    },
  };
}
