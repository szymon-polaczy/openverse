import { defineNuxtPlugin } from "#imports"

export default defineNuxtPlugin(() => {
  const sentry = {
    captureException: (error: unknown, extra: unknown) => {
      console.log("Sentry fallback for captureException", error, extra)
    },
    captureMessage: (message: string, extra: unknown) => {
      console.log("Sentry fallback for captureMessage", message, extra)
    },
  }
  return {
    provide: {
      sentry,
    },
  }
})
