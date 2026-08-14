import { expect, test, type Page } from "@playwright/test"
import { demoLogin, firstPatient, getJson, nextMonday, pinnedNow } from "./helpers"
import {
  APP_SCREENS,
  PUBLIC_SCREENS,
  THEME_STORAGE_KEY,
  THEMES,
  VIEWPORTS,
  type Screen,
  type Theme
} from "./screens"

const applyTheme = async (page: Page, theme: Theme) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme]
  )
}

const signIn = async (page: Page) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
}

const shoot = async (page: Page, name: string) => {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  await expect.soft(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: "disabled",
    mask: [page.getByTestId("demo-banner"), page.locator('[data-testid^="countdown-"]')],
    maxDiffPixels: 0
  })
}

const settle = async (page: Page, screen: Screen) => {
  if (screen.settle) await expect(page.locator(screen.settle).first()).toBeVisible()
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${theme} at ${viewport.name}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      for (const screen of PUBLIC_SCREENS) {
        test(`${screen.name}`, async ({ page }) => {
          await applyTheme(page, theme)
          await page.goto(screen.path as string)
          await settle(page, screen)
          await shoot(page, `${screen.name}-${viewport.name}-${theme}`)
        })
      }

      test(`authenticated screens`, async ({ page, request }) => {
        await applyTheme(page, theme)
        await signIn(page)

        const token = await demoLogin(request)
        const branches = await getJson<Array<{ id: string }>>(request, token, "/branches")
        const branchId = branches[0]?.id
        expect(branchId, "the demo tenant has no branches").toBeDefined()
        const monday = nextMonday(pinnedNow())
        const patient = await firstPatient(request, token)

        const deepLink: Record<string, string> = {
          timeline: `/app/timeline?d=${monday}&b=${branchId}`,
          roster: `/app/roster?w=${monday}&b=${branchId}`,
          "patient-detail": `/app/patients/${patient.id}`
        }

        for (const screen of APP_SCREENS) {
          const target = deepLink[screen.name] ?? (screen.path as string)
          await page.goto(target)
          const targetPath = target.split("?")[0]
          await expect(
            page,
            `${screen.name} bounced to another route — the session dropped, and shooting now would ` +
              `record the wrong screen under the right filename`
          ).toHaveURL(new RegExp(`${targetPath}(\\?|$)`))
          if (screen.name === "timeline") {
            const grid = viewport.width >= 768
            await expect(
              page.getByTestId(grid ? "timeline-shell" : "agenda-filter-bar")
            ).toBeVisible()
            if (grid) await expect(page.getByTestId("timeline-canvas")).toBeVisible()
            await expect(page.getByRole("heading", { name: "Timeline", level: 1 })).toBeAttached()
          }
          await shoot(page, `${screen.name}-${viewport.name}-${theme}`)
        }
      })
    })
  }
}
