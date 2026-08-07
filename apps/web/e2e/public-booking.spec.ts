import type { Appointment } from "@dentalops/contracts"
import { expect, test } from "@playwright/test"
import {
  bkkDayLabel,
  clearColumn,
  dayWindow,
  demoLogin,
  findRosteredDentist,
  findSixtyMinuteService,
  getJson,
  nextMonday
} from "./helpers"

const PHONE_VIEWPORT = { width: 390, height: 844 }
const REALTIME_TIMEOUT = 10_000
const MAX_DAY_STEPS = 8

declare global {
  interface Window {
    __j1DeskDocument?: true
  }
}

test("J1: a phone booking lands on the staff timeline without a reload", async ({
  page: deskPage,
  browser,
  request
}) => {
  const token = await demoLogin(request)
  const monday = nextMonday()
  const { dentist, branch } = await findRosteredDentist(request, token, monday)
  const service = await findSixtyMinuteService(request, token)
  await clearColumn(request, token, dentist.id, monday)

  const stamp = String(Date.now()).slice(-8)
  const patientName = `Phone Patient ${stamp}`
  const patientPhone = `09${stamp}`

  await deskPage.goto("/")
  await deskPage.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(deskPage).toHaveURL(/\/app\/timeline/)

  let subscribed = false
  deskPage.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      const payload = frame.payload.toString()
      if (payload.includes("subscribe") && payload.includes(branch.id)) subscribed = true
    })
  })

  await deskPage.goto(`/app/timeline?d=${monday}&b=${branch.id}`)
  await expect(deskPage.getByTestId(`col-${dentist.id}`)).toBeVisible()
  await expect.poll(() => subscribed, { timeout: REALTIME_TIMEOUT }).toBe(true)

  await deskPage.evaluate(() => {
    window.__j1DeskDocument = true
  })

  const phoneContext = await browser.newContext({ viewport: PHONE_VIEWPORT })
  const phonePage = await phoneContext.newPage()

  await phonePage.goto("/book/demo-clinic")
  await phonePage.getByRole("button", { name: branch.name, exact: true }).click()
  await phonePage.getByRole("button", { name: service.name }).click()
  await phonePage.getByRole("button", { name: dentist.name }).click()

  const dayLabel = phonePage.getByText(bkkDayLabel(monday))
  for (let step = 0; step < MAX_DAY_STEPS; step += 1) {
    if (await dayLabel.isVisible()) break
    await phonePage.getByRole("button", { name: "Next day of slots" }).click()
  }
  await expect(dayLabel).toBeVisible()

  const firstSlot = phonePage.getByTestId("slot").first()
  await expect(firstSlot).toBeVisible()
  const slotLabel = (await firstSlot.innerText()).trim()
  await firstSlot.click()

  await expect(phonePage.getByRole("heading", { name: "Your details" })).toBeVisible()
  await expect(phonePage.getByRole("region", { name: "Appointment recap" })).toBeVisible()
  await phonePage.getByLabel("Full name").fill(patientName)
  await phonePage.getByLabel("Mobile number").fill(patientPhone)
  await phonePage.getByRole("button", { name: "Confirm booking" }).click()
  await expect(phonePage.getByRole("heading", { name: "You are booked" })).toBeVisible()

  await phonePage.getByRole("link", { name: "Change or cancel this booking" }).click()
  await expect(phonePage.getByRole("heading", { name: "Your booking" })).toBeVisible()
  await phonePage.getByRole("button", { name: "Cancel this booking" }).click()
  await expect(phonePage.getByRole("alertdialog", { name: "Cancel this booking?" })).toBeVisible()
  await phonePage.getByRole("button", { name: "Keep appointment" }).click()
  await expect(phonePage.getByRole("alertdialog")).not.toBeVisible()

  const arrival = deskPage.locator("[data-appt]").filter({ hasText: patientName })
  await expect(arrival).toBeVisible({ timeout: REALTIME_TIMEOUT })
  await expect(arrival).toHaveAttribute("data-dentist", dentist.id)
  await expect(arrival).toContainText(slotLabel)
  await expect(deskPage.locator("p[role='status']")).toHaveText(
    "A new booking just arrived on this day",
    { timeout: REALTIME_TIMEOUT }
  )

  const sameDocument = await deskPage.evaluate(() => window.__j1DeskDocument === true)
  expect(sameDocument).toBe(true)

  const booked = await getJson<Appointment[]>(
    request,
    token,
    `/appointments?dentistId=${dentist.id}&${dayWindow(monday)}`
  )
  const confirmed = booked.filter((a) => a.status === "confirmed")
  expect(confirmed).toHaveLength(1)
  expect(confirmed[0]?.patient.name).toBe(patientName)
  expect(confirmed[0]?.branchId).toBe(branch.id)

  await phoneContext.close()
})
