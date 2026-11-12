// Runs in the page's MAIN world. The site keeps its bearer token in encrypted storage and
// attaches it to its own API calls. This script notes that header as the site sends it,
// keeps it in this closure only (never stored, never posted to the extension's isolated
// world), and replays it to exactly one read endpoint.

const API_BASE = 'https://api-mofidapp.emofid.com/web/';
/** Read-only guard: the only request this extension ever makes. */
const HISTORY_URL = `${API_BASE}tbs/api/v1/user/accountHistory/me`;

export const PANEL_SOURCE = 'emx-panel';
export const BRIDGE_SOURCE = 'emx-bridge';

export interface PanelRequest {
  source: typeof PANEL_SOURCE;
  id: number;
  skip?: number;
  pageSize?: number;
  abort?: boolean;
}

export interface BridgeReply {
  source: typeof BRIDGE_SOURCE;
  id: number;
  status: number;
  body: unknown;
  retryAfterMs: number | null;
}

export function installBridge() {
  let authorization: string | null = null;
  let appVersion: string | null = null;

  const note = (name: string, value: string) => {
    const n = name.toLowerCase();
    if (n === 'authorization' && value.startsWith('Bearer ')) authorization = value;
    else if (n === 'appname-versionname') appVersion = value;
  };

  const xhrUrls = new WeakMap<XMLHttpRequest, string>();
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    xhrUrls.set(this, String(args[1]));
    return (open as (...a: unknown[]) => void).apply(this, args);
  } as typeof open;
  const setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (xhrUrls.get(this)?.startsWith(API_BASE)) note(name, value);
    return setRequestHeader.call(this, name, value);
  };

  const pageFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(API_BASE)) {
        new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) =>
          note(k, v),
        );
      }
    } catch {
    }
    return pageFetch.call(window, input, init);
  };

  const inFlight = new Map<number, AbortController>();
  const isCount = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data as PanelRequest | null;
    if (!msg || msg.source !== PANEL_SOURCE || typeof msg.id !== 'number') return;

    if (msg.abort) return void inFlight.get(msg.id)?.abort();
    if (!isCount(msg.skip, 1e7) || !isCount(msg.pageSize, 100)) return;

    const reply = (r: Omit<BridgeReply, 'source' | 'id'>) =>
      window.postMessage({ source: BRIDGE_SOURCE, id: msg.id, ...r } satisfies BridgeReply, location.origin);

    if (!authorization) return reply({ status: -1, body: null, retryAfterMs: null });

    const controller = new AbortController();
    inFlight.set(msg.id, controller);
    try {
      const res = await pageFetch.call(window, HISTORY_URL, {
        method: 'POST',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
          ...(appVersion ? { 'Appname-Versionname': appVersion } : {}),
        },
        body: JSON.stringify({ skip: msg.skip, pageSize: msg.pageSize }),
      });
      const retryAfter = Number(res.headers.get('Retry-After'));
      reply({
        status: res.status,
        body: await res.json().catch(() => null),
        retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : null,
      });
    } catch {
      reply({ status: 0, body: null, retryAfterMs: null });
    } finally {
      inFlight.delete(msg.id);
    }
  });
}
