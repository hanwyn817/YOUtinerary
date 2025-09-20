/// <reference types="astro/client" />

import type { Env } from './server/cloudflare/utils';

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
    };
  }
}
