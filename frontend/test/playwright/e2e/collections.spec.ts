/**
 * The commented-out assertions will be re-enabled after the fetching
 * of collections is fixed using `VMediaCollection` component
 * introduced in https://github.com/WordPress/openverse/pull/3831
 */

import { test, expect, Page } from "@playwright/test"

import { preparePageForTests } from "~~/test/playwright/utils/navigation"
import {
  getCopyButton,
  getH1,
  getLoadMoreButton,
  // getLoadMoreButton,
} from "~~/test/playwright/utils/components"
import { t } from "~~/test/playwright/utils/i18n"
import {
  collectAnalyticsEvents,
  expectEventPayloadToMatch,
} from "~~/test/playwright/utils/analytics"

test.describe.configure({ mode: "parallel" })

test.describe("collections", () => {
  test.beforeEach(async ({ page }) => {
    await preparePageForTests(page, "xl")
    await page.goto("/image/f9384235-b72e-4f1e-9b05-e1b116262a29")
    // Wait for the page to hydrate
    await expect(getCopyButton(page)).toBeEnabled()
  })

  test("can open tags collection page from image page", async ({ page }) => {
    // Using the href because there are multiple links with the same text.
    await page.click('[href*="image/collection?tag="]')

    await page.waitForURL(/image\/collection/)

    await expect(getH1(page, /cat/i)).toBeVisible()
    await expect(getLoadMoreButton(page)).toBeEnabled()
    expect(await page.locator("figure").count()).toEqual(20)
  })

  test("can open source collection page from image page", async ({ page }) => {
    const sourcePattern = /flickr/i

    await page.getByRole("link", { name: sourcePattern }).first().click()

    await page.waitForURL(/image\/collection/)

    await expect(getH1(page, sourcePattern)).toBeVisible()
    await expect(getLoadMoreButton(page)).toBeEnabled()
    expect(await page.locator("figure").count()).toEqual(20)
  })

  test("can open creator collection page from image page", async ({ page }) => {
    const creatorPattern = /strogoscope/i
    await page.getByRole("link", { name: creatorPattern }).first().click()

    await page.waitForURL(/image\/collection/)

    await expect(getH1(page, creatorPattern)).toBeVisible()
    await expect(getLoadMoreButton(page)).toBeEnabled()
    expect(await page.locator("figure").count()).toEqual(20)
  })
})

const COLLAPSE_BUTTON = (page: Page) =>
  page.getByRole("button", { name: t("mediaDetails.tags.showLess") })
const EXPAND_BUTTON = (page: Page) =>
  page.getByRole("button", { name: t("mediaDetails.tags.showMore") })

test("some tags are hidden if there are more than 3 rows", async ({ page }) => {
  await preparePageForTests(page, "xl")
  await page.goto("/image/2bc7dde0-5aad-4cf7-b91d-7f0e3bd06750")

  await expect(EXPAND_BUTTON(page)).toBeVisible()
  const tags = page.getByRole("list", { name: t("mediaDetails.tags.title") })
  await expect(tags).toBeVisible()
  const tagsCount = await tags.locator("li").count()

  await EXPAND_BUTTON(page).click()
  expect(await tags.locator("li").count()).toBeGreaterThan(tagsCount)
})

test("sends analytics events when tags are toggled", async ({
  context,
  page,
}) => {
  await preparePageForTests(page, "xl")
  const analyticsEvents = collectAnalyticsEvents(context)
  await page.goto("/image/2bc7dde0-5aad-4cf7-b91d-7f0e3bd06750")

  await EXPAND_BUTTON(page).click()
  await COLLAPSE_BUTTON(page).click()

  const toggleEvents = analyticsEvents.filter(
    (event) => event.n === "TOGGLE_TAG_EXPANSION"
  )
  expect(toggleEvents).toHaveLength(2)
  expectEventPayloadToMatch(toggleEvents[0], { toState: "expanded" })
  expectEventPayloadToMatch(toggleEvents[1], { toState: "collapsed" })
})
