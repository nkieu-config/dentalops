import { type ReactElement, type ReactNode } from "react"
import { PublicNav, type PublicNavPage } from "../../components/shell/public-nav"
import { passwordStrength } from "./password-strength"

export const PasswordStrengthHint = ({ password }: { password: string }): ReactElement | null => {
  const strength = passwordStrength(password)
  if (!strength) return null

  return (
    <p className="type-ui text-muted-foreground">
      Password strength: {strength}
    </p>
  )
}

export interface AuthCardProps {
  page: PublicNavPage
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export const AuthCard = ({ page, title, subtitle, children, footer }: AuthCardProps): ReactElement => (
  <div className="flex min-h-dvh flex-col bg-surface-band pb-[env(safe-area-inset-bottom)] text-foreground">
    <a href="#auth-main" className="sr-only rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Skip to main content</a>
    <PublicNav current={page} />
    <main
      id="auth-main"
      className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-14"
    >
      <div className="hero-enter w-full max-w-md space-y-6 rounded-card border border-border bg-card p-6 shadow-xs sm:p-8">
        <header className="space-y-1.5">
          <h1 className="type-page-title font-semibold tracking-tight text-balance">{title}</h1>
          {subtitle ? (
            <p className="type-supporting leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </header>
        {children}
        {footer ? (
          <footer className="border-t border-border pt-4 type-ui text-muted-foreground">
            {footer}
          </footer>
        ) : null}
      </div>
    </main>
  </div>
)
