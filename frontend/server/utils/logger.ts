import { env } from "node:process"

import { consola } from "consola"

if (env.NODE_ENV !== "production") {
  consola.info("Running in development mode")
  env.CONSOLA_LEVEL = "debug"
} else {
  env.CONSOLA_LEVEL = "info"
}

export const logger = consola.withTag("Openverse")
