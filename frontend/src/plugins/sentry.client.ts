import { defineNuxtPlugin } from "#imports"

import * as Sentry from "@sentry/vue"

export default defineNuxtPlugin((nuxtApp) => {
  const {
    public: { sentry },
  } = nuxtApp.$config
  if (!sentry || !sentry.dsn) {
    console.warn("Sentry DSN is not provided")
    return
  }

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn: sentry.dsn,
    environment: sentry.environment,
    // Only allow errors that come from openverse.org or a subdomain
    allowUrls: [/^https?:\/\/((.*)\.)?openverse\.org/],
    ignoreErrors: [
      // Ignore browser extension errors
      /window\.bannerNight/,
      /mce-visual-caret-hidden/,

      // Ignore errant focus-trap-vue errors
      /`initialFocus` did not return a node/,

      // Ignore ResizeObserver loop-related errors
      /ResizeObserver loop limit exceeded/,
      /ResizeObserver loop completed with undelivered notifications/,

      // Cloudflare
      /sendBeacon/,

      // Local errors
      /__webpack_hmr\/modern/,
    ],
  })

  Sentry.setContext("render context", {
    platform: "client",
  })
  const providedSentry = {
    captureException: Sentry.captureException,
    captureMessage: Sentry.captureMessage,
  }
  return {
    provide: providedSentry,
  }
})
