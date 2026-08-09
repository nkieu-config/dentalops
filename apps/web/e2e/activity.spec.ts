import { expect, test } from "@playwright/test"
import { demoLogin, firstBranch, nextMonday, postJson, weekWindow } from "./helpers"

test("J6: the activity feed reads as who, what and when, with a deterministic entry", async ({
  page,
  request
}) => {
  const token = await demoLogin(request)
  const branch = await firstBranch(request, token)
  const weekStart = nextMonday()
  await postJson(request, token, "/roster/validate", {
    branchId: branch.id,
    ...weekWindow(weekStart),
    draftShifts: []
  })

  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)

  await page.goto("/app/activity")
  await expect(page.getByRole("heading", { name: "Clinic activity" })).toBeVisible()

  const entry = page.getByText("checked the roster").first()
  await expect(entry).toBeVisible()

  const row = entry.locator("xpath=ancestor::li[1]")
  await expect(row.locator("time")).toBeVisible()
  await expect(row.locator("[aria-label]").first()).toBeVisible()
})
