import type { APIRoute } from 'astro';
import type { Itinerary } from '../../../lib/types';
import {
  type Env,
  allowCors,
  errorResponse,
  generateId,
  handleOptions,
  jsonResponse,
  listItineraries,
  normalizeItinerary,
  parseBody,
  requireSession,
  slugify
} from '../../../server/cloudflare/utils';

export const prerender = false;

function getEnv(locals: App.Locals): Env {
  const env = locals.runtime?.env as Env | undefined;
  if (!env) {
    throw new Error('环境变量未准备好');
  }
  return env;
}

export const OPTIONS: APIRoute = async ({ request }) => handleOptions(request) ?? jsonResponse({}, { status: 200 });

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const includeFull =
    url.searchParams.get('full') === '1' ||
    url.searchParams.get('include') === 'full' ||
    url.searchParams.get('view') === 'full';
  const result = await listItineraries(env, cursor, { includeFull });
  const payload = includeFull
    ? { items: result.full ?? [], nextCursor: result.cursor, listComplete: result.list_complete }
    : { items: result.items, nextCursor: result.cursor, listComplete: result.list_complete };
  return allowCors(request, jsonResponse(payload));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!(await requireSession(env, request))) {
    return allowCors(request, errorResponse('需要先解锁编辑权限', 401));
  }

  try {
    const payload = await parseBody<Partial<Itinerary>>(request);
    const now = new Date().toISOString();
    const title = payload.title?.trim() || '未命名行程';
    const slugBase = payload.slug?.trim() || slugify(title);
    const slug = slugify(slugBase);
    const id = payload.id?.trim() || generateId(slug);

    const itinerary = normalizeItinerary({
      ...payload,
      id,
      title,
      slug,
      createdAt: payload.createdAt ?? now,
      updatedAt: now,
      tags: payload.tags ?? [],
      startLabel: payload.startLabel ?? '',
      endLabel: payload.endLabel ?? '',
      description: payload.description ?? '',
      baseCurrency: payload.baseCurrency ?? 'CNY',
      attachments: payload.attachments ?? [],
      totalBudget:
        payload.totalBudget ?? ({
          transport: 0,
          stay: 0,
          activities: 0,
          others: 0,
          currency: payload.baseCurrency ?? 'CNY'
        } as Itinerary['totalBudget'])
    });

    await env.ITINERARIES.put(id, JSON.stringify(itinerary));
    return allowCors(request, jsonResponse({ item: itinerary }, { status: 201 }));
  } catch (error) {
    console.error(error);
    return allowCors(request, errorResponse((error as Error).message || '服务器错误', 500));
  }
};
