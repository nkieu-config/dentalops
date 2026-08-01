import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it } from "vitest"
import { API, HttpResponse, http, server } from "../../test/msw"
import { RequireAuth } from "./require-auth"

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/" element={<p>landing</p>} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <p>protected</p>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>
  )

describe("RequireAuth", () => {
  it("restores the session via silent refresh", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: "t1",
          user: {
            id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            tenantId: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
            name: "Owner",
            role: "owner"
          }
        })
      )
    )
    mount()
    expect(await screen.findByText("protected")).toBeInTheDocument()
  })

  it("redirects to landing when refresh fails", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })))
    mount()
    expect(await screen.findByText("landing")).toBeInTheDocument()
  })
})
