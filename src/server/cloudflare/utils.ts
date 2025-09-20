import type {
  ActivityInfo,
  DayItem,
  DayItemType,
  DayNote,
  Itinerary,
  ItineraryDay,
  ItineraryMeta,
  StayInfo,
  TransportInfo
} from '../../lib/types';

export type Env = {
  ITINERARIES: KVNamespace;
  SETTINGS: KVNamespace;
  SESSION: KVNamespace;
  DEFAULT_PASSWORD?: string;
  SESSION_TTL_SECONDS?: string;
  GAODE_REST_KEY?: string;
};

export const SESSION_COOKIE = 'youtinerary_session';
const PASSWORD_KEY = 'password_hash';
const SESSION_PREFIX = 'session:';
const ATTEMPT_KEY = 'unlock_attempts';

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...init.headers
    },
    status: init.status ?? 200,
    statusText: init.statusText
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

export async function parseBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch (error) {
    throw new Error('无法解析请求 JSON');
  }
}

export async function ensurePasswordExists(env: Env): Promise<void> {
  const exists = await env.SETTINGS.get(PASSWORD_KEY);
  if (exists) return;

  const fallback = env.DEFAULT_PASSWORD;
  if (!fallback) {
    throw new Error('尚未设置管理密码。请在 KV SETTINGS 中写入 password 或配置 DEFAULT_PASSWORD 环境变量。');
  }

  const record = await createPasswordHash(fallback);
  await env.SETTINGS.put(PASSWORD_KEY, JSON.stringify(record));
}

export async function verifyPassword(env: Env, password: string): Promise<boolean> {
  const stored = await env.SETTINGS.get(PASSWORD_KEY);
  if (!stored) {
    await ensurePasswordExists(env);
    return verifyPassword(env, password);
  }

  const parsed = JSON.parse(stored) as PasswordRecord;
  const hash = await deriveHash(password, parsed.salt);
  return hash === parsed.hash;
}

export async function createPasswordHash(password: string): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufferToHex(saltBytes.buffer);
  const hash = await deriveHash(password, salt);
  return { hash, salt };
}

async function deriveHash(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = hexToBuffer(saltHex);
  const passwordBytes = encoder.encode(password);
  const combined = new Uint8Array(saltBytes.byteLength + passwordBytes.byteLength);
  combined.set(new Uint8Array(saltBytes), 0);
  combined.set(passwordBytes, saltBytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', combined.buffer);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

export interface PasswordRecord {
  hash: string;
  salt: string;
}

export async function createSession(env: Env, token: string): Promise<void> {
  const ttl = Number(env.SESSION_TTL_SECONDS ?? 8 * 3600);
  await env.SESSION.put(`${SESSION_PREFIX}${token}`, '1', { expirationTtl: ttl });
}

export async function checkSession(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const record = await env.SESSION.get(`${SESSION_PREFIX}${token}`);
  return Boolean(record);
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const match = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

export function sessionCookieHeader(token: string, ttlSeconds = 8 * 3600): string {
  const expires = new Date(Date.now() + ttlSeconds * 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; Path=/; Max-Age=${ttlSeconds}; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

export async function requireSession(env: Env, request: Request): Promise<boolean> {
  const token = readSessionCookie(request);
  return checkSession(env, token);
}

export function buildMeta(itinerary: Itinerary): ItineraryMeta {
  return {
    id: itinerary.id,
    title: itinerary.title,
    slug: itinerary.slug,
    createdAt: itinerary.createdAt,
    updatedAt: itinerary.updatedAt,
    tags: itinerary.tags,
    startLabel: itinerary.startLabel,
    endLabel: itinerary.endLabel,
    coverImage: itinerary.coverImage
  };
}

export async function listItineraries(env: Env, cursor?: string, options: { includeFull?: boolean } = {}) {
  const result = await env.ITINERARIES.list({ cursor, limit: 50 });
  const items: ItineraryMeta[] = [];
  const full: Itinerary[] = options.includeFull ? [] : undefined;
  for (const key of result.keys) {
    const record = await env.ITINERARIES.get(key.name, 'json');
    if (record) {
      const itinerary = normalizeItinerary(record);
      items.push(buildMeta(itinerary));
      if (full) {
        full.push(itinerary);
      }
    }
  }
  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (full) {
    full.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return { items, full, cursor: result.cursor, list_complete: result.list_complete };
}

export function generateId(slugBase?: string): string {
  if (slugBase) {
    return `trip_${slugBase}_${Date.now()}`;
  }
  return `trip_${crypto.randomUUID()}`;
}

export function slugify(title: string, fallback = 'my-trip'): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || fallback;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function ensureTransport(transport: Partial<TransportInfo> | undefined): TransportInfo {
  return {
    id: transport?.id ?? randomId('transport_'),
    from: transport?.from ?? '',
    departTime: transport?.departTime ?? '',
    to: transport?.to ?? '',
    arriveTime: transport?.arriveTime ?? '',
    mode: transport?.mode ?? 'other',
    route: transport?.route ?? '',
    cost: transport?.cost,
    memo: transport?.memo ?? '',
    provider: transport?.provider,
    bookingCode: transport?.bookingCode,
    fromLocation: transport?.fromLocation,
    toLocation: transport?.toLocation
  };
}

function ensureStay(stay: Partial<StayInfo> | undefined): StayInfo {
  return {
    id: stay?.id ?? randomId('stay_'),
    name: stay?.name ?? '',
    address: stay?.address ?? '',
    checkInTime: stay?.checkInTime,
    checkOutTime: stay?.checkOutTime,
    cost: stay?.cost,
    memo: stay?.memo ?? '',
    confirmationNumber: stay?.confirmationNumber,
    location: stay?.location
  };
}

function ensureActivity(activity: Partial<ActivityInfo> | undefined): ActivityInfo {
  return {
    id: activity?.id ?? randomId('activity_'),
    name: activity?.name ?? '',
    address: activity?.address ?? '',
    startTime: activity?.startTime,
    endTime: activity?.endTime,
    cost: activity?.cost,
    memo: activity?.memo ?? '',
    bookingCode: activity?.bookingCode,
    location: activity?.location
  };
}

function ensureNote(note: Partial<DayNote> | undefined): DayNote {
  return {
    id: note?.id ?? randomId('note_'),
    text: note?.text ?? ''
  };
}

function normalizeItem(item: any, fallbackType: DayItemType = 'note'): DayItem {
  const type = item?.type ?? fallbackType;
  if (type === 'transport') {
    return { id: item?.id ?? randomId('item_'), type, transport: ensureTransport(item?.transport ?? item) };
  }
  if (type === 'stay') {
    return { id: item?.id ?? randomId('item_'), type, stay: ensureStay(item?.stay ?? item) };
  }
  if (type === 'activity') {
    return { id: item?.id ?? randomId('item_'), type, activity: ensureActivity(item?.activity ?? item) };
  }
  return { id: item?.id ?? randomId('item_'), type: 'note', note: ensureNote(item?.note ?? item) };
}

function normalizeDay(raw: any, index: number): ItineraryDay {
  const id = raw?.id ?? randomId('day_');
  const label = raw?.label ?? `第${index + 1}天`;
  if (Array.isArray(raw?.items)) {
    const items = raw.items.map((item: any) => normalizeItem(item, item?.type ?? 'note'));
    return { id, label, date: raw?.date, items };
  }

  const items: DayItem[] = [];
  if (Array.isArray(raw?.transport)) {
    for (const entry of raw.transport) {
      items.push({ id: randomId('item_'), type: 'transport', transport: ensureTransport(entry) });
    }
  }
  if (Array.isArray(raw?.activities)) {
    for (const entry of raw.activities) {
      items.push({ id: randomId('item_'), type: 'activity', activity: ensureActivity(entry) });
    }
  }
  if (Array.isArray(raw?.stays)) {
    for (const entry of raw.stays) {
      items.push({ id: randomId('item_'), type: 'stay', stay: ensureStay(entry) });
    }
  }
  if (Array.isArray(raw?.notes)) {
    for (const entry of raw.notes) {
      items.push({ id: randomId('item_'), type: 'note', note: ensureNote(entry) });
    }
  }

  return { id, label, date: raw?.date, items };
}

export function normalizeItinerary(raw: any): Itinerary {
  const base = raw ?? {};
  const daysSource = Array.isArray(base.days) ? base.days : [];
  const normalizedDays = daysSource.map((day: any, index: number) => normalizeDay(day, index));
  return {
    ...base,
    id: base.id ?? generateId('trip'),
    title: base.title ?? '未命名行程',
    slug: base.slug ?? slugify(base.title ?? 'trip'),
    createdAt: base.createdAt ?? new Date().toISOString(),
    updatedAt: base.updatedAt ?? new Date().toISOString(),
    tags: Array.isArray(base.tags) ? base.tags : [],
    days: normalizedDays
  } as Itinerary;
}

export async function recordFailedAttempt(env: Env): Promise<number> {
  const currentRaw = await env.SETTINGS.get(ATTEMPT_KEY);
  const current = currentRaw ? Number(currentRaw) : 0;
  const next = current + 1;
  await env.SETTINGS.put(ATTEMPT_KEY, String(next), { expirationTtl: 300 });
  return next;
}

export async function resetAttempts(env: Env): Promise<void> {
  await env.SETTINGS.delete(ATTEMPT_KEY);
}

export async function tooManyAttempts(env: Env): Promise<boolean> {
  const currentRaw = await env.SETTINGS.get(ATTEMPT_KEY);
  const current = currentRaw ? Number(currentRaw) : 0;
  return current >= 5;
}

export function allowCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  return new Response(response.body, { ...response, headers });
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    },
    status: 204
  });
}
