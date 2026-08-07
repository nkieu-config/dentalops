import { authSessionSchema } from "@dentalops/contracts"
import { useState, type ReactElement } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { z } from "zod"
import { api, ApiError } from "../../lib/api"
import { setSession } from "../../lib/session"
import { AuthCard, Field, FieldInput, FormError, SubmitButton } from "./auth-form"
import { PasswordField } from "./password-field"
import { SLUG_PATTERN } from "./slug"
import { useAuthForm } from "./use-auth-form"

const LAST_CLINIC_KEY = "dentalops.lastClinic"

const CLINIC_HINT = "The clinic URL you chose at signup."

const SIGN_IN_FAILED =
  "We could not sign you in. Check the clinic URL, email and password, then try again."

const loginSchema = z.object({
  clinicSlug: z
    .string()
    .regex(SLUG_PATTERN, "Latin letters, numbers and hyphens, 3 to 40 characters."),
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password")
})

const readRememberedClinic = (): string => {
  try {
    return localStorage.getItem(LAST_CLINIC_KEY) ?? ""
  } catch {
    return ""
  }
}

const rememberClinic = (slug: string): void => {
  try {
    localStorage.setItem(LAST_CLINIC_KEY, slug)
  } catch {
    return
  }
}

export const LoginPage = (): ReactElement => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [initial] = useState(() => ({
    clinicSlug: searchParams.get("clinic") ?? readRememberedClinic(),
    email: "",
    password: ""
  }))

  const form = useAuthForm({
    schema: loginSchema,
    initial,
    onSubmit: async (values) => {
      const session = await api("/auth/login", authSessionSchema, {
        method: "POST",
        body: values
      }).catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) throw new Error(SIGN_IN_FAILED)
        throw cause
      })
      setSession(session)
      rememberClinic(values.clinicSlug)
      void navigate("/app/timeline")
    }
  })

  return (
    <AuthCard
      title="Welcome back to your clinic"
      subtitle="Your schedule and team are where you left them."
      footer={
        <>
          No clinic yet? <Link to="/signup">Create a clinic</Link>
        </>
      }
    >
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field
          id="clinicSlug"
          label="Clinic URL"
          error={form.errors.clinicSlug}
          hint={CLINIC_HINT}
        >
          {(aria) => (
            <FieldInput
              {...aria}
              name="clinicSlug"
              type="text"
              autoComplete="organization"
              autoCapitalize="none"
              spellCheck={false}
              value={form.values.clinicSlug}
              onChange={(event) => form.set("clinicSlug", event.target.value)}
            />
          )}
        </Field>
        <Field id="email" label="Email" error={form.errors.email}>
          {(aria) => (
            <FieldInput
              {...aria}
              name="email"
              type="email"
              autoComplete="email"
              value={form.values.email}
              onChange={(event) => form.set("email", event.target.value)}
            />
          )}
        </Field>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={form.values.password}
          error={form.errors.password}
          onChange={(event) => form.set("password", event.target.value)}
        />
        <SubmitButton pending={form.pending} pendingLabel="Signing you in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthCard>
  )
}
