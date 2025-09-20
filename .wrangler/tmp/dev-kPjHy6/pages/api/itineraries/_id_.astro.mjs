globalThis.process ??= {}; globalThis.process.env ??= {};
import { h as handleOptions, j as jsonResponse, a as allowCors, e as errorResponse, n as normalizeItinerary, d as requireSession, p as parseBody, f as slugify } from '../../../chunks/utils_Bkg4K4Ll.mjs';
export { r as renderers } from '../../../chunks/_@astro-renderers_BlVgbzts.mjs';

const prerender = false;
function getEnv(locals) {
  const env = locals.runtime?.env;
  if (!env) {
    throw new Error("环境变量未准备好");
  }
  return env;
}
const OPTIONS = async ({ request }) => handleOptions(request) ?? jsonResponse({}, { status: 200 });
const GET = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse("缺少行程 ID", 400));
  }
  const record = await env.ITINERARIES.get(id, "json");
  if (!record) {
    return allowCors(request, errorResponse("未找到对应行程", 404));
  }
  const itinerary = normalizeItinerary(record);
  return allowCors(request, jsonResponse({ item: itinerary }));
};
const PUT = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse("缺少行程 ID", 400));
  }
  if (!await requireSession(env, request)) {
    return allowCors(request, errorResponse("需要先解锁编辑权限", 401));
  }
  const existing = await env.ITINERARIES.get(id, "json");
  if (!existing) {
    return allowCors(request, errorResponse("行程不存在", 404));
  }
  const base = normalizeItinerary(existing);
  const payload = await parseBody(request);
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
const DELETE = async ({ request, locals, params }) => {
  const env = getEnv(locals);
  const id = params.id;
  if (!id) {
    return allowCors(request, errorResponse("缺少行程 ID", 400));
  }
  if (!await requireSession(env, request)) {
    return allowCors(request, errorResponse("需要先解锁编辑权限", 401));
  }
  await env.ITINERARIES.delete(id);
  return allowCors(request, new Response(null, { status: 204 }));
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  OPTIONS,
  PUT,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
