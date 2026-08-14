import { AlertCircle, Eye, EyeOff } from "lucide-react"
import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode
} from "react"
import { cn } from "../../lib/cn"
import { Button } from "./button"
import { focusRing } from "./focus-ring"
import { Input } from "./input"
import { Label } from "./label"

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
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error !== undefined,
        "aria-describedby": describedBy.length > 0 ? describedBy : undefined
      })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-2 type-ui font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="type-ui text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const FieldInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === "password"
    const inputType = isPassword ? (showPassword ? "text" : "password") : type

    if (!isPassword) {
      return <Input ref={ref} type={inputType} className={className} {...props} />
    }

    return (
      <div className="relative flex items-center">
        <Input ref={ref} type={inputType} className={cn("pr-11 sm:pr-10", className)} {...props} />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className={cn(
            "absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control text-muted-foreground transition-colors hover:text-foreground sm:w-10",
            focusRing
          )}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    )
  }
)
FieldInput.displayName = "FieldInput"

export const FormError = ({ message }: { message: string | null }): ReactElement | null =>
  message ? (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control border border-destructive bg-destructive-surface px-3.5 py-2.5 type-ui font-medium text-destructive-on-surface"
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
  form?: string
  children: ReactNode
}

export const SubmitButton = ({
  pending,
  pendingLabel,
  disabled = false,
  title,
  describedBy,
  form,
  children
}: SubmitButtonProps): ReactElement => (
  <Button
    type="submit"
    form={form}
    className="w-full font-semibold"
    disabled={pending || disabled}
    aria-busy={pending}
    title={title}
    aria-describedby={describedBy}
  >
    {pending ? pendingLabel : children}
  </Button>
)
