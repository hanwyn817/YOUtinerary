import type { APIRoute } from 'astro';
import type { Itinerary } from '../../../lib/types';
import {
  type Env,
  allowCors,
  errorResponse,
  handleOptions,
  jsonResponse,
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

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse('缺少行程 ID', 400));
  }

  const record = await env.ITINERARIES.get(id, 'json');
  if (!record) {
    return allowCors(request, errorResponse('未找到对应行程', 404));
  }
  const itinerary = normalizeItinerary(record);
  return allowCors(request, jsonResponse({ item: itinerary }));
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse('缺少行程 ID', 400));
  }

  if (!(await requireSession(env, request))) {
    return allowCors(request, errorResponse('需要先解锁编辑权限', 401));
  }

  const existing = await env.ITINERARIES.get(id, 'json');
  if (!existing) {
    return allowCors(request, errorResponse('行程不存在', 404));
  }

  const base = normalizeItinerary(existing);
  const payload = await parseBody<Partial<Itinerary>>(request);
  const now = new Date().toISOString();

  const updated = normalizeItinerary({
    ...base,
    ...payload,
    slug: payload.slug ? slugify(payload.slug) : base.slug,
    title: payload.title?.trim() || base.title,
    tags: payload.tags ?? base.tags,
    days: payload.days ?? base.days,
    attachments: payload.attachments ?? base.attachments,
    totalBudget: payload.totalBudget ?? base.totalBudget,
    updatedAt: now
  });

  await env.ITINERARIES.put(id, JSON.stringify(updated));
  return allowCors(request, jsonResponse({ item: updated }));
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse('缺少行程 ID', 400));
  }

  if (!(await requireSession(env, request))) {
    return allowCors(request, errorResponse('需要先解锁编辑权限', 401));
  }

  await env.ITINERARIES.delete(id);
  return allowCors(request, new Response(null, { status: 204 }));
};
