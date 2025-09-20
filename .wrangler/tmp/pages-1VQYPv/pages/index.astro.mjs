globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, r as renderTemplate, k as renderComponent } from '../chunks/astro/server_EH_iM6iK.mjs';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_n5OTxxwO.mjs';
export { r as renderers } from '../chunks/_@astro-renderers_BlVgbzts.mjs';

const $$Astro = createAstro();
const $$HeroBanner = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HeroBanner;
  const actions = Astro2.props.actions ?? [];
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-sky-100 via-white to-emerald-100/60"> <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_60%)]"></div> <div class="relative mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-8"> <span class="rounded-full border border-sky-300 bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.3em] text-sky-500">那就出发吧！</span> <h1 class="text-3xl font-semibold text-slate-800 sm:text-5xl">
YOUtinerary · 你的私人行程小管家
</h1> <p class="max-w-2xl text-base text-slate-600 sm:text-lg">
聚合交通、住宿与游玩灵感，随时记录旅行灵感，轻松导出行程，与同行伙伴共享每一天的期待。
</p> <div class="flex flex-wrap gap-3"> ${actions.map((action) => renderTemplate`<a${addAttribute(action.href, "href")}${addAttribute(`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition ${action.variant === "secondary" ? "border border-sky-300 bg-white/70 text-sky-600 hover:border-sky-400 hover:text-sky-500" : "bg-gradient-to-r from-sky-400 via-sky-500 to-emerald-400 text-white shadow-lg shadow-sky-200 hover:from-sky-300 hover:via-sky-400 hover:to-emerald-300"}`, "class")}> ${action.label} </a>`)} </div> </div> </section>`;
}, "/Users/hanwyn/Project/YOUtinerary/src/components/HeroBanner.astro", void 0);

function OverviewTable($$renderer, $$props) {
	$$renderer.component(($$renderer) => {

		$$renderer.push(`<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100"><div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 class="text-xl font-semibold text-slate-800">行程总览</h2> <p class="text-sm text-slate-500">纵览所有行程的每日安排，快速了解节奏与重点。</p></div> <div class="flex flex-wrap gap-3"><a href="/itinerary/new" class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300">新建行程</a></div></div> `);

		{
			$$renderer.push('<!--[-->');
			$$renderer.push(`<div class="mt-6 flex items-center justify-center rounded-2xl border border-slate-200 bg-sky-50 py-12 text-sm text-slate-500">正在加载行程...</div>`);
		}

		$$renderer.push(`<!--]--></section>`);
	});
}

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "YOUtinerary \xB7 \u90A3\u5C31\u51FA\u53D1\u5427\uFF01" }, { "default": ($$result2) => renderTemplate`  ${maybeRenderHead()}<section class="mt-8"> ${renderComponent($$result2, "OverviewTable", OverviewTable, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/Users/hanwyn/Project/YOUtinerary/src/components/overview/OverviewTable.svelte", "client:component-export": "default" })} </section> <section id="gaode-integration" class="mt-16 flex flex-col gap-6 rounded-3xl border border-slate-800/70 bg-slate-950/80 p-6 text-sm text-slate-200 shadow-lg shadow-sky-500/10"> <h2 class="text-2xl font-semibold text-slate-50">高德地图集成指南</h2> <p>
按需为交通路线与地点检索启用高德地图 API。在 Cloudflare Pages Functions 中配置一个代理，将前端请求转发给高德服务，隐藏 API Key。
</p> <ol class="grid gap-4 text-sm text-slate-300 sm:grid-cols-2"> <li class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
1. 在高德开放平台创建应用，获取 Web 服务 Key，限定 referer。
</li> <li class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
2. 在 \`functions/api/gaode/route.ts\` 中配置代理（稍后生成）。
</li> <li class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
3. 在前端为地点输入框挂载高德地点选择器，实现自动补全、路线规划。
</li> <li class="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
4. 针对高频调用设置节流与结果缓存，避免 Key 被滥用。
</li> </ol> </section> `, "hero": ($$result2) => renderTemplate`${renderComponent($$result2, "HeroBanner", $$HeroBanner, { "slot": "hero", "actions": [
    { label: "\u65B0\u5EFA\u884C\u7A0B", href: "/itinerary/new" },
    { label: "\u67E5\u770B\u8DEF\u7EBF\u6307\u5F15", href: "#gaode-integration", variant: "secondary" }
  ] })}` })}`;
}, "/Users/hanwyn/Project/YOUtinerary/src/pages/index.astro", void 0);

const $$file = "/Users/hanwyn/Project/YOUtinerary/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
