// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: [
    "/*"
  ],
  exclude: [
    "/_astro/*",
    "/favicon.svg"
  ]
};

// node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "/Users/hanwyn/Project/YOUtinerary/.wrangler/tmp/pages-1VQYPv/bundledWorker-0.14725462339324413.mjs";
import { isRoutingRuleMatch } from "/Users/hanwyn/Project/YOUtinerary/node_modules/wrangler/templates/pages-dev-util.ts";
export * from "/Users/hanwyn/Project/YOUtinerary/.wrangler/tmp/pages-1VQYPv/bundledWorker-0.14725462339324413.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        if (worker.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return worker.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=1yuimrin6yq.js.map
