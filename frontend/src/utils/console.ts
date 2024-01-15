import { isProd } from "~/utils/node-env"

export const getLogger = (level: "log" | "warn" | "error") =>
  isProd && import.meta.client
    ? () => {
        // do nothing
      }
    : console[level]

export const warn = getLogger("warn")
export const log = getLogger("log")
export const error = getLogger("error")
