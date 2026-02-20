import type { APIRoute } from 'astro';
import type { CurrencyCode } from '../../../lib/types';
import {
  type Env,
  allowCors,
  errorResponse,
  handleOptions,
  jsonResponse,
  requireSession
} from '../../../server/cloudflare/utils';

export const prerender = false;

const SUPPORTED_API_CURRENCIES = new Set<CurrencyCode>([
  'CNY',
  'USD',
  'JPY',
  'HKD',
  'EUR',
  'GBP',
  'AUD',
  'TWD',
  'KRW',
  'THB'
]);

const RATES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let fixerRatesCache:
  | {
      expiresAt: number;
      rates: Partial<Record<CurrencyCode, number>>;
    }
  | null = null;
let fixerRatesInFlight: Promise<Partial<Record<CurrencyCode, number>>> | null = null;

function getEnv(locals: App.Locals): Env {
  const env = locals.runtime?.env as Env | undefined;
  if (!env) {
    throw new Error('环境变量未准备好');
  }
  return env;
}

function isValidPositiveRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function loadFixerRates(accessKey: string): Promise<Partial<Record<CurrencyCode, number>>> {
  const now = Date.now();
  if (fixerRatesCache && fixerRatesCache.expiresAt > now) {
    return fixerRatesCache.rates;
  }
  if (fixerRatesInFlight) {
    return fixerRatesInFlight;
  }

  fixerRatesInFlight = (async () => {
    const url = new URL('https://data.fixer.io/api/latest');
    url.searchParams.set('access_key', accessKey);
    url.searchParams.set('symbols', Array.from(SUPPORTED_API_CURRENCIES).join(','));

    const upstream = await fetch(url.toString(), { cf: { cacheTtl: 86400 } });
    if (!upstream.ok) {
      throw new Error(`latest 端点 HTTP ${upstream.status}`);
    }

    const payload = (await upstream.json()) as {
      success?: boolean;
      rates?: Partial<Record<CurrencyCode, number>>;
      error?: { type?: string; info?: string };
    };

    if (!payload.success) {
      throw new Error(payload.error?.info || payload.error?.type || 'latest 端点返回失败');
    }

    const rates = payload.rates ?? {};
    fixerRatesCache = {
      expiresAt: Date.now() + RATES_CACHE_TTL_MS,
      rates
    };
    return rates;
  })();

  try {
    return await fixerRatesInFlight;
  } finally {
    fixerRatesInFlight = null;
  }
}

export const OPTIONS: APIRoute = async ({ request }) => handleOptions(request) ?? jsonResponse({}, { status: 200 });

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!(await requireSession(env, request))) {
    return allowCors(request, errorResponse('需要先解锁编辑权限', 401));
  }

  const accessKey = env.FIXER_ACCESS_KEY;
  if (!accessKey) {
    return allowCors(request, errorResponse('缺少 FIXER_ACCESS_KEY 配置', 500));
  }

  const url = new URL(request.url);
  const fromRaw = (url.searchParams.get('from') ?? '').toUpperCase() as CurrencyCode;
  const toRaw = (url.searchParams.get('to') ?? '').toUpperCase() as CurrencyCode;
  const amountRaw = url.searchParams.get('amount') ?? '';

  if (!fromRaw || !toRaw || !amountRaw) {
    return allowCors(request, errorResponse('from、to、amount 为必填参数', 400));
  }

  if (!SUPPORTED_API_CURRENCIES.has(fromRaw) || !SUPPORTED_API_CURRENCIES.has(toRaw)) {
    return allowCors(request, errorResponse('不支持该币种换算', 400));
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return allowCors(request, errorResponse('amount 必须是大于等于 0 的数字', 400));
  }

  if (fromRaw === toRaw) {
    return allowCors(
      request,
      jsonResponse({
        from: fromRaw,
        to: toRaw,
        amount,
        result: amount
      })
    );
  }

  try {
    const rates = await loadFixerRates(accessKey);
    const fromRate = fromRaw === 'EUR' ? 1 : rates[fromRaw];
    const toRate = toRaw === 'EUR' ? 1 : rates[toRaw];

    if (!isValidPositiveRate(fromRate) || !isValidPositiveRate(toRate)) {
      return allowCors(request, errorResponse('latest 端点缺少有效币种汇率', 502));
    }

    const result = amount * (toRate / fromRate);
    if (!Number.isFinite(result) || result < 0) {
      return allowCors(request, errorResponse('汇率换算结果无效', 502));
    }

    return allowCors(
      request,
      jsonResponse({
        from: fromRaw,
        to: toRaw,
        amount,
        result
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '转发汇率换算请求失败';
    console.error('Fixer latest convert proxy error', message);
    return allowCors(request, errorResponse(`汇率换算失败：${message}`, 502));
  }
};
