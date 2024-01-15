import { useNuxtApp } from "#imports"

/**
 * This wrapper around the plugin, retained to reduce code churn.
 * @see Refer to frontend/src/plugins/analytics.ts for plugin implementation
 *
 * @deprecated For new code, use `$sendCustomEvent` from Nuxt context
 */
export const useAnalytics = () => {
  const { $sendCustomEvent } = useNuxtApp()

  // const sendCustomEvent = <T extends EventName>(name: T, payload: Events[T]) => useTrackEvent(name, { props: {...payload }})

  return { sendCustomEvent: $sendCustomEvent }
}
