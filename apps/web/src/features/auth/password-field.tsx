import { Eye, EyeOff } from "lucide-react"
import { useState, type ChangeEvent } from "react"
import { Button } from "../../components/ui/button"
import { Field, FieldInput } from "./auth-form"

interface PasswordFieldProps {
  label: string
  name: string
  autoComplete: string
  value: string
  error?: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export const PasswordField = ({
  label,
  name,
  autoComplete,
  value,
  error,
  onChange
}: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false)

  return (
    <Field id="password" label={label} error={error}>
      {(aria) => (
        <div className="relative">
          <FieldInput
            {...aria}
            className="pr-12"
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            value={value}
            onChange={onChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-11 w-11 sm:h-9 sm:w-9"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      )}
    </Field>
  )
}
