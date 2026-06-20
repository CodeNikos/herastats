import { resolveApiBaseUrl } from '../config/apiBaseUrl';

const SESSION_KEY = 'herastats_analytics_session';

export function getOrCreateSessionKey() {
  try {
    let key = sessionStorage.getItem(SESSION_KEY);
    if (!key) {
      key =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

export function sendPageViewBeacon({ path, query, referrer, sessionKey }) {
  const base = resolveApiBaseUrl();
  const payload = JSON.stringify({
    path: path || '/',
    query: query || '',
    referrer: referrer || '',
    sessionKey: sessionKey || getOrCreateSessionKey()
  });

  const url = `${base}/analytics/collect`;

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'omit'
  }).catch(() => {});
}
