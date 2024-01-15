import { defineNuxtPlugin } from "#imports"

export default defineNuxtPlugin(() => {
  const sentry = {
    captureException: (error: unknown, extra: unknown) => {
      console.log("Sentry fallback for captureException", error, extra)
    },
  }
  return {
    provide: {
      sentry,
    },
  }
})
