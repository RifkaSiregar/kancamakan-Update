import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getLang, t } from '../i18n';

/**
 * Alamat backend.
 * 1) extra.apiUrl di app.json (isi saat backend sudah di-deploy, misalnya https://api.kancamakan.id)
 * 2) Kosong → otomatis: komputer yang menjalankan `npx expo start`, port 3000.
 *    - Web: http://<host halaman>:3000
 *    - HP dengan Expo Go: http://<IP laptop>:3000 (diambil dari alamat Metro)
 */
function resolveApiUrl() {
  const fixed = ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl || '').replace(/\/$/, '');
  if (fixed) return fixed;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:3000`;
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  return `http://${host || 'localhost'}:3000`;
}

export const API_URL = resolveApiUrl();

let token: string | null = null;
let onUnauthorized: ((message?: string) => void) | null = null;

export const setToken = (t: string | null) => {
  token = t;
};
export const setUnauthorizedHandler = (fn: (message?: string) => void) => {
  onUnauthorized = fn;
};

/** URL lengkap untuk berkas dari server (misalnya foto /uploads/...). */
export const fileUrl = (path: string | null | undefined) => (path ? (path.startsWith('http') ? path : `${API_URL}${path}`) : null);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 20000, raw?: { data: Blob; type: string }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      // Accept-Language: pesan error, tantangan, dan hasil AI dari server mengikuti bahasa aplikasi.
      headers: { 'Content-Type': raw ? raw.type : 'application/json', 'Accept-Language': getLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: raw ? raw.data : body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    // Sesi tidak berlaku atau akun dinonaktifkan moderator → keluar.
    if ((res.status === 401 || (res.status === 403 && (json as { banned?: boolean }).banned)) && token) onUnauthorized?.(json.error);
    if (!res.ok) throw new ApiError(json.error || t('Server membalas {status}', { status: res.status }), res.status);
    return json;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new ApiError(t('Server terlalu lama membalas. Coba lagi.'), 0);
    throw new ApiError(t('Tidak bisa terhubung ke server ({url}). Pastikan backend menyala.', { url: API_URL }), 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}, timeoutMs?: number) => request<T>('POST', path, body, timeoutMs),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Kirim file lokal (misalnya video dari galeri) sebagai data mentah. */
  upload: async <T>(path: string, uri: string, type: string, timeoutMs = 120000) => {
    const data = await (await fetch(uri)).blob();
    return request<T>('POST', path, undefined, timeoutMs, { data, type });
  },
};

export const qs = (params: Record<string, string | number | undefined | null | false>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
