import { defineNuxtPlugin, useRuntimeConfig } from "#imports"

import * as Sentry from "@sentry/vue"

export default defineNuxtPlugin((nuxtApp) => {
  const {
    public: { sentry },
  } = useRuntimeConfig()

  if (!sentry.dsn) {
    console.warn("Sentry DSN wasn't provided")
  }

  Sentry.init({
    dsn: sentry.dsn,
    environment: sentry.environment,
    app: nuxtApp.vueApp,
  })

  nuxtApp.hooks.hook("app:error", (error) => {
    console.warn(
      "app:error captured",
      error,
      error.code,
      error.response,
      "statusCode",
      error.statusCode
    )
    Sentry.captureException(error)
  })

  nuxtApp.hooks.hook("vue:error", (error) => {
    console.warn("vue:error captured", error)
    Sentry.captureException(error)
  })

  return {
    provide: {
      sentry: Sentry,
    },
  }
})
