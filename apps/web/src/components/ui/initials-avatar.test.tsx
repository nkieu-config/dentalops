import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { InitialsAvatar } from "./initials-avatar"

describe("InitialsAvatar", () => {
  it("derives stable initials without inventing a profile image", () => {
    const { container } = render(<InitialsAvatar name="Dr. Anong Srisuk" />)
    expect(container.firstChild).toHaveTextContent("DA")
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByLabelText("Dr. Anong Srisuk")).not.toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })
})
