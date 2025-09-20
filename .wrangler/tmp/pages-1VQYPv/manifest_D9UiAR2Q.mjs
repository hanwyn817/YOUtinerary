globalThis.process ??= {}; globalThis.process.env ??= {};
import { o as decodeKey } from './chunks/astro/server_EH_iM6iK.mjs';
import './chunks/astro-designed-error-pages_CluEiJEk.mjs';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/noop-middleware_DEjYqOcX.mjs';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///Users/hanwyn/Project/YOUtinerary/","cacheDir":"file:///Users/hanwyn/Project/YOUtinerary/node_modules/.astro/","outDir":"file:///Users/hanwyn/Project/YOUtinerary/dist/","srcDir":"file:///Users/hanwyn/Project/YOUtinerary/src/","publicDir":"file:///Users/hanwyn/Project/YOUtinerary/public/","buildClientDir":"file:///Users/hanwyn/Project/YOUtinerary/dist/","buildServerDir":"file:///Users/hanwyn/Project/YOUtinerary/dist/_worker.js/","adapterName":"@astrojs/cloudflare","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image\\/?$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"node_modules/@astrojs/cloudflare/dist/entrypoints/image-endpoint.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/auth/unlock","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/auth\\/unlock\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"auth","dynamic":false,"spread":false}],[{"content":"unlock","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/auth/unlock.ts","pathname":"/api/auth/unlock","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/gaode/route","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/gaode\\/route\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"gaode","dynamic":false,"spread":false}],[{"content":"route","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/gaode/route.ts","pathname":"/api/gaode/route","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/itineraries/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/itineraries\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"itineraries","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/itineraries/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/itineraries","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/itineraries\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"itineraries","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/itineraries/index.ts","pathname":"/api/itineraries","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/index.RL6shuEH.css"}],"routeData":{"route":"/itinerary/[id]","isIndex":false,"type":"page","pattern":"^\\/itinerary\\/([^/]+?)\\/?$","segments":[[{"content":"itinerary","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/itinerary/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/index.RL6shuEH.css"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/Users/hanwyn/Project/YOUtinerary/src/pages/index.astro",{"propagation":"none","containsHead":true}],["/Users/hanwyn/Project/YOUtinerary/src/pages/itinerary/[id].astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000astro-internal:middleware":"_astro-internal_middleware.mjs","\u0000noop-actions":"_noop-actions.mjs","\u0000@astro-page:src/pages/api/auth/unlock@_@ts":"pages/api/auth/unlock.astro.mjs","\u0000@astro-page:src/pages/api/gaode/route@_@ts":"pages/api/gaode/route.astro.mjs","\u0000@astro-page:src/pages/api/itineraries/[id]@_@ts":"pages/api/itineraries/_id_.astro.mjs","\u0000@astro-page:src/pages/api/itineraries/index@_@ts":"pages/api/itineraries.astro.mjs","\u0000@astro-page:src/pages/itinerary/[id]@_@astro":"pages/itinerary/_id_.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-ssr-virtual-entry":"index.js","\u0000@astro-page:node_modules/@astrojs/cloudflare/dist/entrypoints/image-endpoint@_@js":"pages/_image.astro.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000@astrojs-manifest":"manifest_D9UiAR2Q.mjs","/Users/hanwyn/Project/YOUtinerary/node_modules/unstorage/drivers/cloudflare-kv-binding.mjs":"chunks/cloudflare-kv-binding_DMly_2Gl.mjs","/Users/hanwyn/Project/YOUtinerary/node_modules/astro/dist/assets/services/sharp.js":"chunks/sharp_CoWFmAJ8.mjs","/Users/hanwyn/Project/YOUtinerary/src/components/itinerary/ItineraryEditor.svelte":"_astro/ItineraryEditor.DWpWnwj0.js","/Users/hanwyn/Project/YOUtinerary/src/components/overview/OverviewTable.svelte":"_astro/OverviewTable.CMMBogfY.js","@astrojs/svelte/client.js":"_astro/client.svelte.DKGHe-Q2.js","/Users/hanwyn/Project/YOUtinerary/node_modules/html2canvas/dist/html2canvas.esm.js":"_astro/html2canvas.esm.B0tyYwQk.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/_astro/index.RL6shuEH.css","/favicon.svg","/_astro/ItineraryEditor.DWpWnwj0.js","/_astro/OverviewTable.CMMBogfY.js","/_astro/client.svelte.DKGHe-Q2.js","/_astro/html2canvas.esm.B0tyYwQk.js","/_astro/render.5W8FXiYa.js","/_astro/schedule.DTDz25t4.js","/_worker.js/_@astrojs-ssr-adapter.mjs","/_worker.js/_astro-internal_middleware.mjs","/_worker.js/_noop-actions.mjs","/_worker.js/index.js","/_worker.js/renderers.mjs","/_worker.js/_astro/index.RL6shuEH.css","/_worker.js/chunks/BaseLayout_n5OTxxwO.mjs","/_worker.js/chunks/_@astro-renderers_BlVgbzts.mjs","/_worker.js/chunks/_@astrojs-ssr-adapter_Ci_7_e2f.mjs","/_worker.js/chunks/astro-designed-error-pages_CluEiJEk.mjs","/_worker.js/chunks/astro_BK7P3k_U.mjs","/_worker.js/chunks/cloudflare-kv-binding_DMly_2Gl.mjs","/_worker.js/chunks/image-endpoint_Cg4Dbir6.mjs","/_worker.js/chunks/index_DjMQO1nX.mjs","/_worker.js/chunks/noop-middleware_DEjYqOcX.mjs","/_worker.js/chunks/path_lFLZ0pUM.mjs","/_worker.js/chunks/sharp_CoWFmAJ8.mjs","/_worker.js/chunks/utils_Bkg4K4Ll.mjs","/_worker.js/pages/_image.astro.mjs","/_worker.js/pages/index.astro.mjs","/_worker.js/chunks/astro/server_EH_iM6iK.mjs","/_worker.js/pages/api/itineraries.astro.mjs","/_worker.js/pages/itinerary/_id_.astro.mjs","/_worker.js/pages/api/auth/unlock.astro.mjs","/_worker.js/pages/api/gaode/route.astro.mjs","/_worker.js/pages/api/itineraries/_id_.astro.mjs"],"buildFormat":"directory","checkOrigin":true,"serverIslandNameMap":[],"key":"D5UhjNCCU+bNonT+K2L5vg45Y6fqW/Bq2aUPsVO2Nf8=","sessionConfig":{"driver":"cloudflare-kv-binding","options":{"binding":"SESSION"}}});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = () => import('./chunks/cloudflare-kv-binding_DMly_2Gl.mjs');

export { manifest };
