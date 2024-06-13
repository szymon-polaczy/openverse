import { test } from "@playwright/test"

import breakpoints from "~~/test/playwright/utils/breakpoints"
import {
  ensureSearchPageHydrated,
  preparePageForTests,
} from "~~/test/playwright/utils/navigation"

test.describe.configure({ mode: "parallel" })

breakpoints.describeEvery(({ breakpoint, expectSnapshot }) => {
  test.beforeEach(async ({ page }) => {
    await preparePageForTests(page, breakpoint, {
      dismissBanners: false,
      dismissFilter: false,
    })
    await page.goto("/ru/search/?q=birds&referrer=creativecommons.org")
    await ensureSearchPageHydrated(page)
  })

  test("page with all banners", async ({ page }) => {
    await expectSnapshot(`page-with-all-banners`, page)
  })
})
