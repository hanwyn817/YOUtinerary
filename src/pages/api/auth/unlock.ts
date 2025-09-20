import type { APIRoute } from 'astro';
import type { UnlockRequest, UnlockResponse } from '../../../lib/types';
import {
  type Env,
  allowCors,
  createSession,
  errorResponse,
  handleOptions,
  jsonResponse,
  parseBody,
  recordFailedAttempt,
  resetAttempts,
  sessionCookieHeader,
  tooManyAttempts,
  verifyPassword
} from '../../../server/cloudflare/utils';

export const prerender = false;

export const OPTIONS: APIRoute = async ({ request }) => {
  const response = handleOptions(request);
  return response ?? jsonResponse({}, { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env as Env | undefined;
  if (!env) {
    return errorResponse('环境变量未准备好', 500);
  }

  const cors = handleOptions(request);
  if (cors) return cors;

  try {
    if (await tooManyAttempts(env)) {
      return allowCors(request, errorResponse('尝试次数过多，请稍后再试', 429));
    }

    const payload = await parseBody<UnlockRequest>(request);
    if (!payload.password) {
      return allowCors(request, errorResponse('密码为空', 400));
    }

    const ok = await verifyPassword(env, payload.password);
    if (!ok) {
      const attempts = await recordFailedAttempt(env);
      const remaining = Math.max(0, 5 - attempts);
      return allowCors(
        request,
        jsonResponse({ ok: false, error: remaining > 0 ? `密码错误，还可尝试 ${remaining} 次` : '密码错误' } satisfies UnlockResponse, {
          status: 401
        })
      );
    }

    const token = crypto.randomUUID();
    await createSession(env, token);
    await resetAttempts(env);

    const ttl = Number(env.SESSION_TTL_SECONDS ?? 8 * 3600);
    const response = jsonResponse({ ok: true } satisfies UnlockResponse, {
      headers: {
        'Set-Cookie': sessionCookieHeader(token, ttl)
      }
    });
    return allowCors(request, response);
  } catch (error) {
    console.error(error);
    return allowCors(request, errorResponse((error as Error).message || '服务器错误', 500));
  }
};
