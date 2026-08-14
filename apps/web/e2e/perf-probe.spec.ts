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

  const grid = page.getByTestId("perf-grid")
  const cards = await grid.locator('[data-testid^="appt-"]').count()
  console.log(`perf: ${cards} cards painted in ${elapsed.toFixed(0)}ms`)
  expect(elapsed).toBeLessThan(1500)
  expect(cards).toBeGreaterThan(200)
  expect(cards, "the visible range must cull, not mount all thousand").toBeLessThan(1000)

  const covers = async () =>
    await grid.evaluate((node) => {
      const scroll = node.querySelector('[data-testid="timegrid-scroll"]')
      if (!scroll) throw new Error("no scroll container")
      const box = scroll.getBoundingClientRect()
      const mounted = [...node.querySelectorAll('[data-testid^="appt-"]')]
      const inside = mounted.filter((card) => {
        const rect = card.getBoundingClientRect()
        return rect.bottom > box.top && rect.top < box.bottom
      })
      return { mounted: mounted.length, inside: inside.length }
    })

  expect((await covers()).inside).toBeGreaterThan(0)

  await grid
    .getByTestId("timegrid-scroll")
    .evaluate((node) => node.scrollTo({ top: node.scrollHeight }))
  await expect
    .poll(async () => (await covers()).inside, {
      message: "scrolling to the end must mount the cards that come into view"
    })
    .toBeGreaterThan(0)
})
