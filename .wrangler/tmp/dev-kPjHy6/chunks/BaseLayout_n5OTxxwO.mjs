globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createComponent, f as createAstro, h as addAttribute, l as renderHead, n as renderSlot, r as renderTemplate } from './astro/server_EH_iM6iK.mjs';
/* empty css                         */

const $$Astro = createAstro();
const $$BaseLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BaseLayout;
  const { title = "YOUtinerary", description = "\u90A3\u5C31\u51FA\u53D1\u5427\uFF01\u8F7B\u677E\u89C4\u5212\u4F60\u7684\u4E13\u5C5E\u65C5\u7A0B\u3002" } = Astro2.props;
  return renderTemplate`<html lang="zh-CN" class="scroll-smooth"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description"${addAttribute(description, "content")}><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${title}</title>${renderHead()}</head> <body class="min-h-screen bg-sky-50 text-slate-800"> <div class="relative flex min-h-screen flex-col bg-gradient-to-br from-sky-50 via-white to-sky-100"> ${renderSlot($$result, $$slots["hero"])} <main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8"> ${renderSlot($$result, $$slots["default"])} </main> <footer class="border-t border-slate-200 bg-white/70 py-6 text-sm text-slate-500"> <div class="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between"> <p>© ${(/* @__PURE__ */ new Date()).getFullYear()} YOUtinerary</p> <p>那就出发吧！</p> </div> </footer> </div> </body></html>`;
}, "/Users/hanwyn/Project/YOUtinerary/src/layouts/BaseLayout.astro", void 0);

export { $$BaseLayout as $ };
