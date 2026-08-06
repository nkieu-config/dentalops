import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { InitialsAvatar } from "./initials-avatar"

describe("InitialsAvatar", () => {
  it("derives stable initials without inventing a profile image", () => {
    render(<InitialsAvatar name="Dr. Anong Srisuk" />)
    expect(screen.getByLabelText("Dr. Anong Srisuk")).toHaveTextContent("DA")
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })
})
