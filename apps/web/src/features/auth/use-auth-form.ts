import { useCallback, useRef, useState, type FormEvent, type RefObject } from "react"
import type { ZodType } from "zod"
import { ApiError } from "../../lib/api"

export type FieldErrors = Record<string, string | undefined>
type FormValues = Record<string, unknown>

export interface UseAuthFormOptions<T, Values extends FormValues> {
  schema: ZodType<T>
  initial: Values
  onSubmit: (values: T) => Promise<void>
  fieldForErrorCode?: (code: string) => string | null
}

export interface AuthForm<Values extends FormValues> {
  values: Values
  errors: FieldErrors
  set: <Field extends Extract<keyof Values, string>>(field: Field, value: Values[Field]) => void
  submit: (event: FormEvent) => void
  pending: boolean
  formError: string | null
  formRef: RefObject<HTMLFormElement | null>
  dirty: boolean
}

const UNEXPECTED_FAILURE = "Something went wrong. Please try again."

const messageFor = (cause: unknown): string =>
  cause instanceof Error && cause.message.length > 0 ? cause.message : UNEXPECTED_FAILURE

export const useAuthForm = <T, Values extends FormValues>({
  schema,
  initial,
  onSubmit,
  fieldForErrorCode
}: UseAuthFormOptions<T, Values>): AuthForm<Values> => {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const inFlight = useRef(false)

  const focusField = useCallback((field: string) => {
    const root: ParentNode = formRef.current ?? document
    root.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()
  }, [])

  const set = useCallback(<Field extends Extract<keyof Values, string>>(field: Field, value: Values[Field]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }, [])

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (inFlight.current) return

      const parsed = schema.safeParse(values)
      if (!parsed.success) {
        const found: FieldErrors = {}
        for (const issue of parsed.error.issues) {
          const [field] = issue.path
          if (typeof field !== "string" || found[field] !== undefined) continue
          found[field] = issue.message
        }
        setErrors(found)
        setFormError(null)
        const first = Object.keys(values).find((field) => found[field] !== undefined)
        if (first) focusField(first)
        return
      }

      inFlight.current = true
      setErrors({})
      setFormError(null)
      setPending(true)

      void onSubmit(parsed.data)
        .catch((cause: unknown) => {
          const field =
            cause instanceof ApiError ? (fieldForErrorCode?.(cause.errorCode) ?? null) : null
          if (field) {
            setErrors({ [field]: messageFor(cause) })
            focusField(field)
            return
          }
          setFormError(messageFor(cause))
        })
        .finally(() => {
          inFlight.current = false
          setPending(false)
        })
    },
    [fieldForErrorCode, focusField, onSubmit, schema, values]
  )

  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  return { values, errors, set, submit, pending, formError, formRef, dirty }
}
