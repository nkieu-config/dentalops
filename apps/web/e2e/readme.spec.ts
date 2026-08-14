import type { Appointment, Branch, RosterValidation } from "@dentalops/contracts"
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import {
  bkkClockLabel,
  dayWindow,
  demoLogin,
  getJson,
  nextMonday,
  pinnedNow,
  postJson,
  recentWeekday,
  weekWindow
} from "./helpers"
import { THEME_STORAGE_KEY, type Theme } from "./screens"

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 375, height: 812 }
const NEIGHBOUR_WINDOW_MS = 2 * 3_600_000

interface Clip {
  x: number
  y: number
  width: number
  height: number
}

test.use({ deviceScaleFactor: 2 })

const outputDir = (): string => resolve(test.info().project.testDir, "../../../docs/assets/readme")

const useTheme = async (page: Page, theme: Theme) => {
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

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
}

const shoot = async (page: Page, name: string, clip?: Clip) => {
  const dir = outputDir()
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, `${name}.png`), animations: "disabled", clip })
}

const branchNamed = async (
  request: APIRequestContext,
  token: string,
  name: string
): Promise<Branch> => {
  const branches = await getJson<Branch[]>(request, token, "/branches")
  const branch = branches.find((candidate) => candidate.name === name)
  if (!branch) throw new Error(`the demo tenant has no ${name} branch`)
  return branch
}

const weekWithViolations = async (
  request: APIRequestContext,
  token: string,
  branchId: string
): Promise<string> => {
  for (const weeksAgo of [0, 1]) {
    const weekStart = recentWeekday(weeksAgo, pinnedNow())
    const { violations } = await postJson<RosterValidation>(request, token, "/roster/validate", {
      branchId,
      ...weekWindow(weekStart),
      draftShifts: []
    })
    if (violations.length > 0) return weekStart
  }
  throw new Error("the demo seed planted no roster violation in the two weeks before the pinned now")
}

const collidablePair = async (
  request: APIRequestContext,
  token: string,
  branchId: string,
  date: string
): Promise<[Appointment, Appointment]> => {
  const appointments = await getJson<Appointment[]>(
    request,
    token,
    `/appointments?branchId=${branchId}&${dayWindow(date)}`
  )
  const byDentist = new Map<string, Appointment[]>()
  for (const appointment of appointments) {
    if (appointment.status !== "confirmed") continue
    const column = byDentist.get(appointment.dentistId) ?? []
    column.push(appointment)
    byDentist.set(appointment.dentistId, column)
  }
  for (const column of byDentist.values()) {
    column.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    for (let i = 0; i + 1 < column.length; i++) {
      const mover = column[i]
      const blocker = column[i + 1]
      if (!mover || !blocker) continue
      if (Date.parse(blocker.startsAt) - Date.parse(mover.startsAt) <= NEIGHBOUR_WINDOW_MS) {
        return [mover, blocker]
      }
    }
  }
  throw new Error(`no dentist has two appointments within two hours of each other on ${date}`)
}

test("timeline, the desktop hero", async ({ page, request }) => {
  await page.setViewportSize(DESKTOP)
  await useTheme(page, "light")
  const token = await demoLogin(request)
  const branch = await branchNamed(request, token, "Ladprao")
  const date = nextMonday(pinnedNow())

  await signIn(page)
  await page.goto(`/app/timeline?d=${date}&b=${branch.id}`)
  await expect(page.getByTestId("timeline-canvas")).toBeVisible()
  await settle(page)

  await shoot(page, "timeline-desktop")
})

test("a conflicting move the database refuses", async ({ page, request }) => {
  await page.setViewportSize(DESKTOP)
  await useTheme(page, "light")
  const token = await demoLogin(request)
  const branch = await branchNamed(request, token, "Ladprao")
  const date = nextMonday(pinnedNow())
  const [mover, blocker] = await collidablePair(request, token, branch.id, date)

  await signIn(page)
  await page.goto(`/app/timeline?d=${date}&b=${branch.id}`)
  await expect(page.getByTestId("timeline-canvas")).toBeVisible()
  await settle(page)

  const moverCard = page.getByTestId(`appt-${mover.id}`)
  const blockerCard = page.getByTestId(`appt-${blocker.id}`)
  await moverCard.scrollIntoViewIfNeeded()
  await expect(moverCard).toBeVisible()
  await expect(blockerCard).toBeVisible()

  const from = await moverCard.boundingBox()
  const onto = await blockerCard.boundingBox()
  expect(from).not.toBeNull()
  expect(onto).not.toBeNull()
  if (!from || !onto) return

  const grabX = from.x + from.width / 2
  const grabOffset = from.height / 2
  await page.mouse.move(grabX, from.y + grabOffset)
  await page.mouse.down()
  await page.mouse.move(grabX, onto.y + grabOffset, { steps: 12 })
  await page.mouse.up()

  await expect(page.getByText(`Conflicts with ${blocker.patient.name}`)).toBeVisible()
  await expect(moverCard).toContainText(bkkClockLabel(Date.parse(mover.startsAt)))

  const bottom = Math.max(from.y + from.height, onto.y + onto.height)

  await shoot(page, "conflict-desktop", {
    x: 0,
    y: 0,
    width: DESKTOP.width,
    height: Math.min(DESKTOP.height, Math.round(bottom + 96))
  })
})

test("roster with the review queue open", async ({ page, request }) => {
  await page.setViewportSize(DESKTOP)
  await useTheme(page, "light")
  const token = await demoLogin(request)
  const branch = await branchNamed(request, token, "Sukhumvit")
  const week = await weekWithViolations(request, token, branch.id)

  await signIn(page)
  await page.goto(`/app/roster?w=${week}&b=${branch.id}`)
  await expect(page.getByTestId("violations-panel")).toBeVisible()
  await settle(page)

  await shoot(page, "roster-violations-desktop")
})

test("the same day seen by chair", async ({ page, request }) => {
  await page.setViewportSize(DESKTOP)
  await useTheme(page, "dark")
  const token = await demoLogin(request)
  const branch = await branchNamed(request, token, "Ladprao")
  const date = nextMonday(pinnedNow())

  await signIn(page)
  await page.goto(`/app/timeline?d=${date}&b=${branch.id}&c=chair`)
  await expect(page.getByTestId("timeline-canvas")).toBeVisible()
  await settle(page)

  await shoot(page, "chairs-desktop-dark")
})

test("public booking on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await useTheme(page, "light")

  await page.goto("/book/demo-clinic")
  await expect(page.getByText("Which branch?")).toBeVisible()
  await settle(page)

  await shoot(page, "public-booking-mobile")
})
