import { Link } from "react-router"
import { BrandMark } from "../ui/brand-mark"
import { buttonVariants } from "../ui/button"
import { ThemeToggle } from "./theme-toggle"

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

export type PublicNavPage = "home" | "login" | "signup"

export const PublicNav = ({ current }: { current: PublicNavPage }) => (
  <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
    <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-2 sm:px-6">
      <Link
        to="/"
        className={`flex items-center gap-2.5 rounded-sm type-subsection-title font-semibold tracking-tight ${FOCUS}`}
      >
        <BrandMark className="size-9 shadow-xs" />
        <span>DentalOps</span>
      </Link>

      <nav
        aria-label="Public navigation"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3"
      >
        {current === "home" ? (
          <>
            <a
              href="#explore-demo"
              className={`hidden rounded-sm type-ui font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block ${FOCUS}`}
            >
              Explore demo
            </a>
            <Link
              to="/login"
              className={`rounded-sm px-3 py-1.5 type-ui font-semibold text-foreground transition-colors hover:text-primary ${FOCUS}`}
            >
              Sign in
            </Link>
            <Link to="/signup" className={buttonVariants({ size: "sm" })}>
              Create a clinic
            </Link>
          </>
        ) : current === "login" ? (
          <Link
            to="/signup"
            className={buttonVariants({ variant: "secondary", size: "sm", className: "border border-border" })}
          >
            Create a clinic
          </Link>
        ) : (
          <Link
            to="/login"
            className={buttonVariants({ variant: "secondary", size: "sm", className: "border border-border" })}
          >
            Sign in
          </Link>
        )}
        <ThemeToggle />
      </nav>
    </div>
  </div>
)
