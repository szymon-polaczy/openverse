import { useRuntimeConfig } from "#imports"

import { defineNitroPlugin } from "nitropack/runtime"
import * as Sentry from "@sentry/node"

import { logger } from "~~/server/utils/logger"

export default defineNitroPlugin((nitroApp) => {
  const {
    public: { sentry },
  } = useRuntimeConfig()

  Sentry.init({
    dsn: sentry.dsn,
    environment: sentry.environment,
    release: sentry.release,
  })
  Sentry.setContext("render context", { platform: "server" })
  logger.success("Initialized sentry on the server with config\n", sentry)

  nitroApp.hooks.hook("request", (event) => {
    event.context.$sentry = Sentry
  })

  nitroApp.hooks.hookOnce("close", async () => {
    logger.log("Closing Sentry")
    await Sentry.close()
  })
})
