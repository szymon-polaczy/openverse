// @vitest-environment node
// Disable nuxt environment to enable mocking the json file
import { beforeEach, describe, expect, vi } from "vitest"

import { setActivePinia, createPinia } from "~~/test/unit/test-utils/pinia"

import { getFlagStatus, useFeatureFlagStore } from "~/stores/feature-flag"
import { OFF, COOKIE, SESSION } from "~/constants/feature-flag"

vi.resetModules()
vi.mock("~~/feat/feature-flags.json", () => ({
  default: {
    features: {
      feat_enabled: {
        status: "enabled",
        description: "Will always be enabled",
        storage: "cookie",
      },
      feat_disabled: {
        status: "disabled",
        description: "Will always be disabled",
        storage: "cookie",
      },
      feat_switchable_optout: {
        status: "switchable",
        description: "Can be switched between on and off",
        defaultState: "on",
        storage: "cookie",
      },
      feat_switchable_optin: {
        status: "switchable",
        description: "Can be switched between on and off",
        defaultState: "off",
        storage: "session",
      },
      feat_no_query: {
        status: "switchable",
        description: "Cannot be flipped by ff_ query params",
        defaultState: "off",
        supportsQuery: false,
      },
      feat_env_specific: {
        status: {
          local: "enabled",
          staging: "switchable",
          production: "disabled",
        },
        description: "Depends on the environment",
        defaultState: "off",
        storage: "cookie",
      },
    },
  },
}))

describe("Feature flag store", () => {
  let initialEnv
  beforeEach(() => {
    setActivePinia(createPinia())
    initialEnv = process.env.DEPLOYMENT_ENV
  })

  afterEach(() => {
    process.env.DEPLOYMENT_ENV = initialEnv
  })

  it("initialises state from JSON", () => {
    const featureFlagStore = useFeatureFlagStore()
    expect(Object.keys(featureFlagStore.flags).length).toBe(6)
  })

  it.each`
    flagName           | featureState
    ${"feat_enabled"}  | ${"on"}
    ${"feat_disabled"} | ${"off"}
  `(
    "does not allow modification of fixed flags",
    ({ flagName, featureState }) => {
      const featureFlagStore = useFeatureFlagStore()
      expect(featureFlagStore.featureState(flagName)).toEqual(featureState)
      expect(featureFlagStore.isOn(flagName)).toEqual(featureState === "on")
    }
  )

  it.each`
    doCookieInit | featureState
    ${false}     | ${"on"}
    ${true}      | ${"off"}
  `(
    "cascades cookie-storage flag from cookies",
    ({ doCookieInit, featureState }) => {
      const flagName = "feat_switchable_optout"
      const featureFlagStore = useFeatureFlagStore()
      if (doCookieInit) {
        featureFlagStore.initFromCookies({
          feat_switchable_optout: OFF,
        })
      }
      expect(featureFlagStore.featureState(flagName)).toEqual(featureState)
      expect(featureFlagStore.isOn(flagName)).toEqual(featureState === "on")
    }
  )

  it.each`
    cookieState | queryState | finalState
    ${"off"}    | ${"on"}    | ${"on"}
    ${"on"}     | ${"off"}   | ${"off"}
  `(
    "cascades flag from cookies and query params",
    ({ cookieState, queryState, finalState }) => {
      const flagName = "feat_switchable_optout"
      const featureFlagStore = useFeatureFlagStore()
      featureFlagStore.initFromCookies({
        [flagName]: cookieState,
      })
      featureFlagStore.initFromQuery({
        [`ff_${flagName}`]: queryState,
      })

      expect(featureFlagStore.featureState(flagName)).toEqual(finalState)
    }
  )

  it.each`
    flagName           | queryState | finalState
    ${"feat_disabled"} | ${"on"}    | ${"off"}
    ${"feat_enabled"}  | ${"off"}   | ${"on"}
  `(
    "does not cascade non-switchable flags from query params",
    ({ flagName, queryState, finalState }) => {
      const featureFlagStore = useFeatureFlagStore()
      featureFlagStore.initFromQuery({
        [`ff_${flagName}`]: queryState,
      })

      expect(featureFlagStore.featureState(flagName)).toEqual(finalState)
    }
  )

  it("does not cascade query-unsupporting flags from query params", () => {
    const featureFlagStore = useFeatureFlagStore()
    expect(featureFlagStore.featureState("feat_no_query")).toEqual(OFF)
    featureFlagStore.initFromQuery({
      feat_no_query: "on",
    })
    expect(featureFlagStore.featureState("feat_no_query")).toEqual(OFF)
  })

  it.each`
    environment     | featureState
    ${"local"}      | ${"on"}
    ${"staging"}    | ${"off"}
    ${"production"} | ${"off"}
  `(
    "returns $featureState for $environment",
    ({ environment, featureState }) => {
      // The value is cleaned up in afterEach
      process.env.DEPLOYMENT_ENV = environment
      const featureFlagStore = useFeatureFlagStore()

      expect(featureFlagStore.featureState("feat_env_specific")).toEqual(
        featureState
      )
      expect(featureFlagStore.isOn("feat_env_specific")).toEqual(
        featureState === "on"
      )
    }
  )

  it.each`
    environment     | flagStatus
    ${"local"}      | ${"switchable"}
    ${"staging"}    | ${"switchable"}
    ${"production"} | ${"disabled"}
  `(
    "handles fallback for missing $environment",
    ({ environment, flagStatus }) => {
      // The value is cleaned up in afterEach
      process.env.DEPLOYMENT_ENV = environment
      const actualStatus = getFlagStatus({
        status: { staging: "switchable" },
      })
      expect(actualStatus).toEqual(flagStatus)
    }
  )

  it.each`
    storage    | flagName
    ${COOKIE}  | ${"feat_switchable_optout"}
    ${SESSION} | ${"feat_switchable_optin"}
  `("returns mapping of switchable flags", ({ storage, flagName }) => {
    const featureFlagStore = useFeatureFlagStore()
    featureFlagStore.initFromCookies({
      [flagName]: featureFlagStore.flags[flagName].defaultState,
    })

    const flagStateMap = featureFlagStore.flagStateMap(storage)
    expect(flagStateMap).toHaveProperty(flagName)

    expect(flagStateMap).not.toHaveProperty("feat_enabled")
    expect(flagStateMap).not.toHaveProperty("feat_disabled")
  })
})
