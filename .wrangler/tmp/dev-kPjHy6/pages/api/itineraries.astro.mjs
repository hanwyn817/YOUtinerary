globalThis.process ??= {}; globalThis.process.env ??= {};
import { h as handleOptions, j as jsonResponse, l as listItineraries, a as allowCors, d as requireSession, e as errorResponse, p as parseBody, f as slugify, g as generateId, n as normalizeItinerary } from '../../chunks/utils_Bkg4K4Ll.mjs';
export { r as renderers } from '../../chunks/_@astro-renderers_BlVgbzts.mjs';

const prerender = false;
function getEnv(locals) {
  const env = locals.runtime?.env;
  if (!env) {
    throw new Error("环境变量未准备好");
  }
  return env;
}
const OPTIONS = async ({ request }) => handleOptions(request) ?? jsonResponse({}, { status: 200 });
const GET = async ({ request, locals }) => {
  const env = getEnv(locals);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? void 0;
  const includeFull = url.searchParams.get("full") === "1" || url.searchParams.get("include") === "full" || url.searchParams.get("view") === "full";
  const result = await listItineraries(env, cursor, { includeFull });
  const payload = includeFull ? { items: result.full ?? [], nextCursor: result.cursor, listComplete: result.list_complete } : { items: result.items, nextCursor: result.cursor, listComplete: result.list_complete };
  return allowCors(request, jsonResponse(payload));
};
const POST = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!await requireSession(env, request)) {
    return allowCors(request, errorResponse("需要先解锁编辑权限", 401));
  }
  try {
    const payload = await parseBody(request);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const title = payload.title?.trim() || "未命名行程";
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
      startLabel: payload.startLabel ?? "",
      endLabel: payload.endLabel ?? "",
      description: payload.description ?? "",
      baseCurrency: payload.baseCurrency ?? "CNY",
      attachments: payload.attachments ?? [],
      totalBudget: payload.totalBudget ?? {
        transport: 0,
        stay: 0,
        activities: 0,
        others: 0,
        currency: payload.baseCurrency ?? "CNY"
      }
    });
    await env.ITINERARIES.put(id, JSON.stringify(itinerary));
    return allowCors(request, jsonResponse({ item: itinerary }, { status: 201 }));
  } catch (error) {
    console.error(error);
    return allowCors(request, errorResponse(error.message || "服务器错误", 500));
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
