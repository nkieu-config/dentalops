import { expect, test } from "@playwright/test"
import { demoLogin, firstPatient } from "./helpers"

test("J5: a filtered search survives the trip into a patient's detail and back", async ({
  page,
  request
}) => {
  const token = await demoLogin(request)
  const patient = await firstPatient(request, token)
  const digits = patient.phone.slice(-4)

  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)

  await page.goto("/app/patients")
  await page.getByLabel("Search patients").fill(digits)
  await expect(page).toHaveURL(new RegExp(`\\?q=${digits}$`))

  const row = page.getByRole("list", { name: "Patients" }).getByRole("link", {
    name: new RegExp(patient.name)
  })
  await expect(row).toBeVisible()
  await row.click()

  await expect(page).toHaveURL(new RegExp(`/app/patients/${patient.id}\\?q=${digits}$`))
  await expect(page.getByRole("heading", { name: patient.name })).toBeVisible()

  await page.getByRole("link", { name: "Back to patients" }).click()

  await expect(page).toHaveURL(new RegExp(`/app/patients\\?q=${digits}$`))
  await expect(page.getByLabel("Search patients")).toHaveValue(digits)
  await expect(row).toBeVisible()
})
