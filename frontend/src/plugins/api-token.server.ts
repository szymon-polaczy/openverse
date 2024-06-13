import { defineNuxtPlugin, useRuntimeConfig } from "#imports"

import { Mutex, MutexInterface } from "async-mutex"

import axios from "axios"

import { logger } from "~~/server/utils/logger"

import type { AxiosError } from "axios"
import type { NuxtApp } from "#app"

/* Process level state */

export interface Process {
  tokenData: {
    accessToken: string
    accessTokenExpiry: number
  }

  tokenFetching: Promise<void>

  fetchingMutex: Mutex
}

export declare let process: NodeJS.Process & Process

/**
 * Store the plugin's "state" on the `process` to prevent it being
 * thrown out in dev mode when the plugin's module
 * is mysteriously reloaded (cache-busted) for each request.
 */
process.tokenData = process.tokenData || {
  accessToken: "", // '' denotes non-existent key
  accessTokenExpiry: 0, // 0 denotes non-existent key
}

process.tokenFetching = process.tokenFetching || Promise.resolve()

/* Token refresh logic */

interface TokenResponse {
  access_token: string
  expires_in: number
}

/**
 * Get the timestamp as the number of seconds from the UNIX epoch.
 * @returns the UNIX timestamp with a resolution of one second
 */
const currTimestamp = (): number => Math.floor(Date.now() / 1e3)

export const expiryThreshold = 5 // seconds
/**
 * Check whether an access token does not yet exist or if the existing
 * access token is set to expire soon.
 * @returns whether the stored access token is about to expire
 */
const isNewTokenNeeded = (): boolean => {
  if (!process.tokenData.accessToken) {
    return true
  }

  // Token is about to expire
  return (
    process.tokenData.accessTokenExpiry - expiryThreshold <= currTimestamp()
  )
}

/**
 * Update `tokenData` with  the new access token given the client ID and secret.
 * @param clientId - the client ID of the application issued by the API
 * @param clientSecret - the client secret of the application issued by the API
 */
const refreshApiAccessToken = async (
  clientId: string,
  clientSecret: string
) => {
  const formData = new URLSearchParams()
  formData.append("client_id", clientId)
  formData.append("client_secret", clientSecret)
  formData.append("grant_type", "client_credentials")

  const apiUrl = process.env.NUXT_PUBLIC_API_URL ?? "https://api.openverse.org/"
  const url = `${apiUrl.endsWith(".engineering/") ? apiUrl.replace(".engineering", ".org") : apiUrl}v1/auth_tokens/token/`

  try {
    const res = await axios.post<TokenResponse>(url, formData)
    process.tokenData.accessToken = res.data.access_token
    process.tokenData.accessTokenExpiry = currTimestamp() + res.data.expires_in
  } catch (e) {
    /**
     * If an error occurs, serve the current request (and any pending)
     * anonymously and hope it works. By setting the expiry to 0 we queue
     * up another token fetch attempt for the next request.
     */
    process.tokenData.accessToken = ""
    process.tokenData.accessTokenExpiry = 0
    ;(e as AxiosError).message = `Unable to retrieve API token. ${
      (e as AxiosError).message
    }`
    logger.warn((e as AxiosError).message)
    throw e
  }
}

process.fetchingMutex = new Mutex()

/**
 * Get an async function that always returns a valid, automatically-refreshed
 * API access token.
 *
 * The `fetchingMutex` allows all requests on the same process to understand
 * whether it's necessary for them to request a token refresh or if another
 * request has already queued the work. If so, they can just await the process-global
 * promise that will resolve when the api token data refresh request has resolved.
 */
export const getApiAccessToken = async (): Promise<string | undefined> => {
  const { apiClientId, apiClientSecret } = useRuntimeConfig()
  if (!(apiClientId || apiClientSecret)) {
    return undefined
  }

  let release: MutexInterface.Releaser | undefined = undefined

  // Only request a new token if one is needed _and_ there is
  // not already another request making the request (represented
  // by the locked mutex).
  if (isNewTokenNeeded() && !process.fetchingMutex.isLocked()) {
    logger.debug("acquiring mutex lock")
    release = await process.fetchingMutex.acquire()
    logger.debug("mutex lock acquired, preparing token refresh request")
    process.tokenFetching = refreshApiAccessToken(apiClientId, apiClientSecret)
  }

  try {
    logger.debug("awaiting the fetching of the api token to resolve")
    await process.tokenFetching
    logger.debug("done waiting for the token, moving on now...")
  } finally {
    /**
     * Releasing must be in a `finally` block otherwise if the
     * tokenFetching promise raises then the mutex will never
     * release and subsequent requests will never retry the
     * refresh.
     */
    if (release) {
      logger.debug("releasing mutex")
      release()
      logger.debug("mutex released")
    }
  }

  return process.tokenData.accessToken
}

export default defineNuxtPlugin(async (app) => {
  let openverseApiToken: string | undefined
  try {
    openverseApiToken = await getApiAccessToken()
  } catch (e) {
    const sentry =
      app.ssrContext?.event.context.$sentry ?? (app as NuxtApp).$sentry
    sentry.captureException(e)
  }
  return {
    provide: {
      openverseApiToken: openverseApiToken || "",
    },
  }
})
