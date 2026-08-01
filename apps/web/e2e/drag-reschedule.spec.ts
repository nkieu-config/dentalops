import type { Appointment } from "@dentalops/contracts"
import { expect, test } from "@playwright/test"
import {
  clearColumn,
  dayWindow,
  demoLogin,
  findFreeDentist,
  findSixtyMinuteService,
  firstBranch,
  firstPatient,
  getJson,
  nextMonday,
  postJson
} from "./helpers"

const HOUR_MS = 3_600_000
const HOUR_PX = 64

test("J2: drag to reschedule, then a beaten-to-slot drag snaps back", async ({ page, request }) => {
  const token = await demoLogin(request)
  const monday = nextMonday()
  const dayStart = Date.parse(`${monday}T00:00:00+07:00`)
  const branch = await firstBranch(request, token)
  const dentist = await findFreeDentist(request, token, monday)
  const service = await findSixtyMinuteService(request, token)
  const patient = await firstPatient(request, token)
  await clearColumn(request, token, dentist.id, monday)

  const book = (startsAt: string) =>
    postJson<Appointment>(request, token, "/appointments", {
      serviceId: service.id,
      dentistId: dentist.id,
      patientId: patient.id,
      branchId: branch.id,
      startsAt
    })

  const source = await book(new Date(dayStart + 9 * HOUR_MS).toISOString())

  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
  await page.goto(`/app/timeline?d=${monday}&b=${branch.id}`)

  const card = page.getByTestId(`appt-${source.id}`)
  await expect(card).toBeVisible()
  await expect(card).toContainText("09:00–10:00")

  const dragBy = async (pixels: number) => {
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + pixels, { steps: 12 })
    await page.mouse.up()
  }

  await dragBy(2 * HOUR_PX)
  await expect(card).toContainText("11:00–12:00")

  const stored = async () => {
    const list = await getJson<Appointment[]>(
      request,
      token,
      `/appointments?dentistId=${dentist.id}&${dayWindow(monday)}`
    )
    return list.find((a) => a.id === source.id)?.startsAt
  }
  await expect.poll(stored).toBe(new Date(dayStart + 11 * HOUR_MS).toISOString())

  const blocker = await book(new Date(dayStart + 13 * HOUR_MS).toISOString())

  await page.goto(`/app/timeline?d=${monday}&b=${branch.id}`)
  await expect(page.getByTestId(`appt-${blocker.id}`)).toBeVisible()
  await expect(card).toContainText("11:00–12:00")

  await dragBy(2 * HOUR_PX)

  await expect(page.getByText(`Conflicts with ${patient.name} at 13:00`)).toBeVisible()
  await expect(card).toContainText("11:00–12:00")
  await expect.poll(stored).toBe(new Date(dayStart + 11 * HOUR_MS).toISOString())
})
