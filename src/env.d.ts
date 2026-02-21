/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/vanillajs" />

import type { Env } from './server/cloudflare/utils';

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
    };
  }
}
