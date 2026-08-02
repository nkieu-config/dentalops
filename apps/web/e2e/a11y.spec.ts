import AxeBuilder from "@axe-core/playwright"
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import { demoLogin, getJson, nextMonday, recentWeekday } from "./helpers"

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }
const BLOCKING = new Set(["serious", "critical"])

interface AxeViolation {
  id: string
  impact?: string | null
  help: string
  nodes: Array<{ target: unknown[]; failureSummary?: string }>
}

const scan = async (page: Page, context?: string) => {
  const builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa"
  ])
  const results = await (context ? builder.include(context) : builder).analyze()
  return (results.violations as AxeViolation[]).filter((v) => BLOCKING.has(v.impact ?? ""))
}

const report = (violations: AxeViolation[]) =>
  violations
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help}\n` +
        v.nodes
          .map((n) => `    ${JSON.stringify(n.target)} ${n.failureSummary ?? ""}`)
          .join("\n")
    )
    .join("\n")

const expectClean = async (page: Page, context?: string) => {
  const violations = await scan(page, context)
  expect(report(violations), report(violations)).toBe("")
}

const signIn = async (page: Page) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
}

const busyDay = async (page: Page, request: APIRequestContext, date = nextMonday()) => {
  const token = await demoLogin(request)
  const monday = date
  const branches = await getJson<Array<{ id: string }>>(request, token, "/branches")
  const branch = branches[0]
  expect(branch).toBeDefined()
  await page.goto(`/app/timeline?d=${monday}&b=${branch!.id}`)
}

test.describe("landing and public booking", () => {
  for (const [name, viewport] of [
    ["390px", PHONE],
    ["1440px", DESKTOP]
  ] as const) {
    test(`landing page has no serious or critical violations at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/")
      await expect(page.getByRole("button", { name: /Try as Owner/ })).toBeVisible()
      await expectClean(page)
    })

    test(`booking wizard has no serious or critical violations at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/book/demo-clinic")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expectClean(page)

      const service = page.getByRole("button", { name: /Cleaning/ }).first()
      await service.click()
      await expect(page.getByTestId("any-dentist-option")).toBeVisible()
      await expectClean(page)

      await page.getByTestId("any-dentist-option").click()
      await expect(
        page
          .locator("[data-testid^='group-']")
          .or(page.getByText("No free slots this day"))
          .first()
      ).toBeVisible()
      await expectClean(page)
    })
  }
})

test.describe("staff screens", () => {
  test("timeline has no serious or critical violations at 1440px", async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await signIn(page)
    await page.waitForSelector("[data-testid='timegrid-scroll']")
    await expectClean(page)
  })

  test("roster editor has no serious or critical violations at 1440px", async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await signIn(page)
    await page.goto("/app/roster")
    await expect(page.getByRole("button", { name: /Add shift/ })).toBeVisible()
    await expectClean(page)
  })

  test("timeline agenda has no serious or critical violations at 390px", async ({
    page,
    request
  }) => {
    await page.setViewportSize(PHONE)
    await signIn(page)
    await busyDay(page, request)
    await page.waitForSelector("[data-testid='agenda-list']")
    await expectClean(page)
  })
})

test.describe("what axe cannot see", () => {
  test("every appointment card is reachable by keyboard and shows a focus ring", async ({
    page,
    request
  }) => {
    await page.setViewportSize(DESKTOP)
    const token = await demoLogin(request)
    const monday = nextMonday()
    const branches = await getJson<Array<{ id: string }>>(request, token, "/branches")
    const branch = branches[0]
    expect(branch).toBeDefined()

    await signIn(page)
    await page.goto(`/app/timeline?d=${monday}&b=${branch!.id}`)
    await page.waitForSelector("[data-testid^='appt-']")

    const first = page.locator("[data-testid^='appt-']").first()
    await first.focus()
    await expect(first).toBeFocused()

    const outline = await first.evaluate((el) => {
      const style = getComputedStyle(el, ":focus-visible")
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`
    })
    expect(outline).not.toBe("none|0px|none")

    await page.keyboard.press("ArrowDown")
    await expect(first).not.toBeFocused()
    await expect(page.locator("[data-testid^='appt-']:focus")).toHaveCount(1)

    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("no status is conveyed by colour alone", async ({ page, request }) => {
    await page.setViewportSize(DESKTOP)
    await signIn(page)
    await busyDay(page, request, recentWeekday())
    await page.waitForSelector("[data-testid^='appt-']")

    const statuses = ["Completed", "No-show", "Cancelled", "Recurring", "Conflict"]
    let labelled = 0
    for (const label of statuses) {
      const icons = page.locator(`[data-testid^='appt-'] [aria-label='${label}']`)
      const count = await icons.count()
      if (count === 0) continue
      labelled += count
      const owner = page.locator(`[data-testid^='appt-']:has([aria-label='${label}'])`).first()
      await expect(owner).toBeVisible()
    }
    expect(labelled).toBeGreaterThan(0)
  })

  test("the five-destination bottom bar fits a 390px phone without clipping a label", async ({
    page
  }) => {
    await page.setViewportSize(PHONE)
    await signIn(page)

    const links = page.getByTestId("bottom-nav").locator("a")
    await expect(links).toHaveCount(5)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)

    for (let i = 0; i < 5; i++) {
      const box = await links.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width + 1)
    }

    const clipped = await links.evaluateAll((nodes) =>
      nodes
        .map((node) => node.querySelector("span"))
        .filter((label) => label !== null && label.scrollWidth > label.clientWidth + 1).length
    )
    expect(clipped).toBe(0)
  })

  test("the activity feed is reachable from the bottom bar at 390px", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await signIn(page)

    await page.getByTestId("bottom-nav").getByRole("link", { name: "Activity" }).click()
    await expect(page).toHaveURL(/\/app\/activity/)
    await expect(
      page
        .getByRole("list", { name: "Activity" })
        .or(page.getByText("Nothing has happened yet"))
        .first()
    ).toBeVisible()
    await expectClean(page)
  })

  test("touch targets on the public wizard are at least 44px at 390px", async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto("/book/demo-clinic")
    await page.getByRole("button", { name: /Cleaning/ }).first().click()
    await page.getByTestId("any-dentist-option").click()

    const chips = page.locator("[data-testid^='group-'] button")
    for (let step = 0; step < 8 && (await chips.count()) === 0; step++) {
      await page.getByRole("button", { name: "Next day of slots" }).click()
      await page.waitForTimeout(250)
    }
    const count = await chips.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const box = await chips.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})
