import { AlertCircle } from "lucide-react"
import { forwardRef, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react"
import { PublicHeader } from "../../components/shell/public-header"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { cn } from "../../lib/cn"

export interface FieldAria {
  id: string
  "aria-invalid": boolean
  "aria-describedby": string | undefined
}

export interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  children: (aria: FieldAria) => ReactNode
}

export const Field = ({ id, label, error, hint, children }: FieldProps): ReactElement => {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ")

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error !== undefined,
        "aria-describedby": describedBy.length > 0 ? describedBy : undefined
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const FieldInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("h-11 sm:h-9", className)} {...props} />
  )
)
FieldInput.displayName = "FieldInput"

export const FormError = ({ message }: { message: string | null }): ReactElement | null =>
  message ? (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive bg-destructive-surface px-3 py-2 text-sm font-medium text-destructive-on-surface"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  ) : null

export interface SubmitButtonProps {
  pending: boolean
  pendingLabel: string
  disabled?: boolean
  title?: string
  describedBy?: string
  children: ReactNode
}

export const SubmitButton = ({
  pending,
  pendingLabel,
  disabled = false,
  title,
  describedBy,
  children
}: SubmitButtonProps): ReactElement => (
  <Button
    type="submit"
    className="h-11 w-full sm:h-10"
    disabled={pending || disabled}
    aria-busy={pending}
    title={title}
    aria-describedby={describedBy}
  >
    {pending ? pendingLabel : children}
  </Button>
)

export interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export const AuthCard = ({ title, subtitle, children, footer }: AuthCardProps): ReactElement => (
  <div className="flex min-h-dvh flex-col">
    <PublicHeader />
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle ? (
          <p className="text-base leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      {children}
      {footer ? <footer className="text-base text-muted-foreground">{footer}</footer> : null}
    </main>
  </div>
)
