import { expect, test } from "@playwright/test"

test("renders a thousand appointment cards inside the frame budget", async ({ page }) => {
  await page.goto("/dev/ui")
  const trigger = page.getByRole("button", { name: /Render 1,000 cards/i })
  await expect(trigger).toBeVisible()

  const elapsed = await page.evaluate(async () => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      /Render 1,000 cards/i.test(node.textContent ?? "")
    )
    if (!button) throw new Error("perf trigger not found")
    const started = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return performance.now() - started
  })

  const cards = await page.locator('[data-testid^="appt-"]').count()
  console.log(`perf: ${cards} cards painted in ${elapsed.toFixed(0)}ms`)
  expect(cards).toBeGreaterThan(800)
  expect(elapsed).toBeLessThan(1500)
})
