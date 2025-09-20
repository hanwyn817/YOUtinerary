import type { APIRoute } from 'astro';
import {
  type Env,
  allowCors,
  errorResponse,
  handleOptions,
  jsonResponse,
  requireSession
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
  if (!(await requireSession(env, request))) {
    return allowCors(request, errorResponse('需要先解锁编辑权限', 401));
  }

  const key = env.GAODE_REST_KEY;
  if (!key) {
    return allowCors(request, errorResponse('缺少高德 API Key 配置', 500));
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? 'driving';
  const origin = url.searchParams.get('origin');
  const destination = url.searchParams.get('destination');
  const departTime = url.searchParams.get('departure_time');

  if (!origin || !destination) {
    return allowCors(request, errorResponse('origin 和 destination 为必填参数', 400));
  }

  const ENDPOINTS: Record<string, string> = {
    driving: 'https://restapi.amap.com/v3/direction/driving',
    transit: 'https://restapi.amap.com/v3/direction/transit/integrated',
    walking: 'https://restapi.amap.com/v3/direction/walking',
    bicycling: 'https://restapi.amap.com/v4/direction/bicycling'
  };

  const endpoint = ENDPOINTS[mode] ?? ENDPOINTS.driving;
  const params = new URLSearchParams({
    key,
    origin,
    destination,
    extensions: 'all'
  });

  if (mode === 'transit') {
    params.set('strategy', url.searchParams.get('strategy') ?? '0');
    if (departTime) {
      const [date, time] = departTime.split('T');
      if (date) params.set('date', date);
      if (time) params.set('time', time);
    }
  }

  try {
    const gaodeUrl = `${endpoint}?${params.toString()}`;
    const upstream = await fetch(gaodeUrl, { cf: { cacheEverything: false } });
    if (!upstream.ok) {
      return allowCors(request, errorResponse('高德接口请求失败', upstream.status));
    }
    const data = await upstream.json();
    return allowCors(
      request,
      jsonResponse({
        mode,
        origin,
        destination,
        provider: 'gaode',
        raw: data
      })
    );
  } catch (error) {
    console.error('Gaode proxy error', error);
    return allowCors(request, errorResponse('转发高德请求失败', 502));
  }
};
