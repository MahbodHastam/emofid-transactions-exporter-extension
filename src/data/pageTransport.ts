import type { Transport } from './apiSource';
import { BRIDGE_SOURCE, PANEL_SOURCE, type BridgeReply, type PanelRequest } from './bridge';

let nextId = 1;

export const pageTransport: Transport = (skip, pageSize, signal) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    const post = (m: Omit<PanelRequest, 'source' | 'id'>) =>
      window.postMessage({ source: PANEL_SOURCE, id, ...m } satisfies PanelRequest, location.origin);

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as BridgeReply | null;
      if (event.source !== window || !msg || msg.source !== BRIDGE_SOURCE || msg.id !== id) return;
      cleanup();
      resolve({ status: msg.status, body: msg.body, retryAfterMs: msg.retryAfterMs });
    };
    const onAbort = () => {
      cleanup();
      post({ abort: true });
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      post({ abort: true });
      resolve({ status: 0, body: null, retryAfterMs: null });
    }, 65_000);

    if (signal.aborted) return onAbort();
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    post({ skip, pageSize });
  });
