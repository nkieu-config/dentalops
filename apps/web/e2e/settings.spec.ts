import { expect, test, type Page } from "@playwright/test"

const signInAs = async (page: Page, role: "Owner" | "Receptionist") => {
  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(`Try as ${role}`) }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
}

test("J4: an owner updates clinic identity and adds a service", async ({ page }) => {
  await signInAs(page, "Owner")
  await page.goto("/app/settings")

  await expect(page.getByRole("heading", { name: "Clinic profile" })).toBeVisible()

  const clinicName = page.getByLabel("Clinic name")
  const originalName = await clinicName.inputValue()
  const updatedName = `${originalName} Studio`
  await clinicName.fill(updatedName)
  await page.getByRole("button", { name: "Save clinic" }).click()
  await expect(page.getByText("Clinic profile saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Clinic name")).toHaveValue(updatedName)

  await page.getByLabel("Clinic name").fill(originalName)
  await page.getByRole("button", { name: "Save clinic" }).click()
  await expect(page.getByText("Clinic profile saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Clinic name")).toHaveValue(originalName)

  const serviceName = `E2E Whitening ${String(Date.now()).slice(-6)}`
  await page.getByRole("button", { name: "Add service" }).click()
  const serviceSheet = page.getByRole("dialog", { name: "Add service" })
  await serviceSheet.getByLabel("Service name").fill(serviceName)
  await serviceSheet.getByRole("button", { name: "Save service" }).click()
  await expect(page.getByText("Service added")).toBeVisible()
  await page.reload()
  await expect(page.getByText(serviceName)).toBeVisible()
})

test("J4: a receptionist receives the owner-only settings boundary", async ({ page }) => {
  await signInAs(page, "Receptionist")
  await page.goto("/app/settings")

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(page.getByText("Only an owner can change clinic settings.")).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Settings sections" })).toHaveCount(0)
})
