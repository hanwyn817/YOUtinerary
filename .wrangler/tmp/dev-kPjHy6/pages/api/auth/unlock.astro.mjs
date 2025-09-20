globalThis.process ??= {}; globalThis.process.env ??= {};
import { h as handleOptions, j as jsonResponse, e as errorResponse, t as tooManyAttempts, a as allowCors, p as parseBody, v as verifyPassword, r as recordFailedAttempt, c as createSession, b as resetAttempts, s as sessionCookieHeader } from '../../../chunks/utils_Bkg4K4Ll.mjs';
export { r as renderers } from '../../../chunks/_@astro-renderers_BlVgbzts.mjs';

const prerender = false;
const OPTIONS = async ({ request }) => {
  const response = handleOptions(request);
  return response ?? jsonResponse({}, { status: 200 });
};
const POST = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env) {
    return errorResponse("环境变量未准备好", 500);
  }
  const cors = handleOptions(request);
  if (cors) return cors;
  try {
    if (await tooManyAttempts(env)) {
      return allowCors(request, errorResponse("尝试次数过多，请稍后再试", 429));
    }
    const payload = await parseBody(request);
    if (!payload.password) {
      return allowCors(request, errorResponse("密码为空", 400));
    }
    const ok = await verifyPassword(env, payload.password);
    if (!ok) {
      const attempts = await recordFailedAttempt(env);
      const remaining = Math.max(0, 5 - attempts);
      return allowCors(
        request,
        jsonResponse({ ok: false, error: remaining > 0 ? `密码错误，还可尝试 ${remaining} 次` : "密码错误" }, {
          status: 401
        })
      );
    }
    const token = crypto.randomUUID();
    await createSession(env, token);
    await resetAttempts(env);
    const ttl = Number(env.SESSION_TTL_SECONDS ?? 8 * 3600);
    const response = jsonResponse({ ok: true }, {
      headers: {
        "Set-Cookie": sessionCookieHeader(token, ttl)
      }
    });
    return allowCors(request, response);
  } catch (error) {
    console.error(error);
    return allowCors(request, errorResponse(error.message || "服务器错误", 500));
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
