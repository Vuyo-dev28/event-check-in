export const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

const CART_SESSION_KEY = 'event-check-in:cart-session';
const SESSION_TOKEN_KEY = 'event-check-in:session-token';

export function getOrCreateCartSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-cart-session';
  let id = window.localStorage.getItem(CART_SESSION_KEY);
  if (!id || id.length < 8) {
    id = `cs_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(CART_SESSION_KEY, id);
  }
  return id;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (window as any).__firebaseToken || window.localStorage.getItem(SESSION_TOKEN_KEY) || null;
}

export function setSessionToken(token: string | null) {
  if (typeof window === 'undefined') return;
  (window as any).__firebaseToken = token;
  if (token) {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const token = getAuthToken();
  const cartSessionId = getOrCreateCartSessionId();
  const headers: Record<string, string> = {
    'x-cart-session': cartSessionId,
    ...(options.headers as Record<string, string> || {}),
  };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = path.startsWith('http') ? path : `${basePath}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data: any = null;
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await resp.json();
  } else {
    data = await resp.text();
  }
  return { ok: resp.ok, status: resp.status, data };
}

export function formatZarFromCents(cents: number | null | undefined): string {
  const val = Number(cents || 0) / 100;
  return `R${val.toLocaleString('en-ZA', { minimumFractionDigits: val % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function formatZar(rands: number | null | undefined): string {
  const val = Number(rands || 0);
  return `R${val.toLocaleString('en-ZA', { minimumFractionDigits: val % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
