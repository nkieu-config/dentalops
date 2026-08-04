import { ThemeToggle } from "./theme-toggle"

interface PublicHeaderProps {
  brandHref?: string
}

export const PublicHeader = ({ brandHref = "/" }: PublicHeaderProps) => (
  <header className="flex h-topbar shrink-0 items-center gap-3 px-4">
    <a
      href={brandHref}
      className="rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      DentalOps
    </a>
    <div className="flex-1" />
    <ThemeToggle />
  </header>
)
