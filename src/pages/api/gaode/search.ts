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
  const keyword = url.searchParams.get('keyword');

  if (!keyword || !keyword.trim()) {
    return allowCors(request, errorResponse('keyword 为必填参数', 400));
  }

  const params = new URLSearchParams({
    key,
    keywords: keyword.trim(),
    extensions: 'all',
    offset: '20'
  });

  try {
    const gaodeUrl = `https://restapi.amap.com/v3/place/text?${params.toString()}`;
    const upstream = await fetch(gaodeUrl, { cf: { cacheEverything: false } });
    if (!upstream.ok) {
      return allowCors(request, errorResponse('高德搜索接口请求失败', upstream.status));
    }
    const data = await upstream.json() as any;
    
    // Transform Amap response to our format
    const items = (data.pois || []).map((poi: any) => {
      // amap format is "lng,lat"
      const [lng, lat] = (poi.location || '').split(',').map(Number);
      return {
        id: poi.id,
        name: poi.name,
        address: typeof poi.address === 'string' && poi.address.length > 0 ? poi.address : `${poi.cityname || ''}${poi.adname || ''}`,
        lat: isNaN(lat) ? 0 : lat,
        lng: isNaN(lng) ? 0 : lng,
        adcode: poi.adcode
      };
    }).filter((item: any) => item.lat !== 0 && item.lng !== 0);

    return allowCors(
      request,
      jsonResponse({
        items,
        provider: 'gaode'
      })
    );
  } catch (error) {
    console.error('Gaode search error', error);
    return allowCors(request, errorResponse('转发高德搜索失败', 502));
  }
};
