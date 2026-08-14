import type { Appointment } from "@dentalops/contracts"
import { expect, test } from "@playwright/test"
import {
  bkkClockLabel,
  clearColumn,
  clearRosterViolations,
  dayAfter,
  demoLogin,
  findRosteredDentist,
  findSixtyMinuteService,
  firstBranch,
  firstPatient,
  nextMonday,
  postJson
} from "./helpers"

const HOUR_MS = 3_600_000

test("J3: shrinking a shift past its appointments blocks the save until it is restored", async ({
  page,
  request
}) => {
  const token = await demoLogin(request)
  const weekStart = nextMonday()
  const target = dayAfter(weekStart, 1)
  const busy = await firstBranch(request, token)
  const { dentist, branch, shift } = await findRosteredDentist(request, token, target, {
    excludeBranchId: busy.id
  })
  const service = await findSixtyMinuteService(request, token)
  const patient = await firstPatient(request, token)

  await clearColumn(request, token, dentist.id, target)
  await clearRosterViolations(request, token, branch.id, weekStart)

  const shiftEnd = Date.parse(shift.endsAt)
  const shrunkEnd = shiftEnd - 2 * HOUR_MS
  for (const startsAt of [shrunkEnd, shiftEnd - HOUR_MS]) {
    await postJson<Appointment>(request, token, "/appointments", {
      serviceId: service.id,
      dentistId: dentist.id,
      patientId: patient.id,
      branchId: branch.id,
      startsAt: new Date(startsAt).toISOString()
    })
  }

  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
  await page.goto(`/app/roster?w=${weekStart}&b=${branch.id}`)

  const block = page.getByTestId(`shift-${shift.id}`)
  await expect(block).toBeVisible()
  await expect(
    page.getByTestId("violations-panel"),
    "a clean roster keeps the review queue out of the editor"
  ).toHaveCount(0)

  await block.click()
  const dialog = page.getByRole("dialog")
  const ends = dialog.getByLabel("Ends")
  const save = dialog.getByRole("button", { name: "Save" })
  await expect(save).toBeEnabled()

  await ends.fill(bkkClockLabel(shrunkEnd))
  await expect(dialog.getByTestId("violations-blocking")).toContainText(
    "2 confirmed appointments fall outside the rostered shifts"
  )
  await expect(dialog.getByRole("link", { name: "View 2 appointments" })).toBeVisible()
  await expect(save).toBeDisabled()

  await ends.fill(bkkClockLabel(shiftEnd))
  await expect(dialog.getByTestId("violations-clean")).toBeVisible()
  await expect(save).toBeEnabled()
})
