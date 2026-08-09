import { authSessionSchema } from "@dentalops/contracts"
import { ArrowRight, CalendarClock, Stethoscope, Users } from "lucide-react"
import { useCallback, useRef, useState, type ReactElement } from "react"
import { Link, useNavigate } from "react-router"
import { z } from "zod"
import { Button } from "../../components/ui/button"
import { api } from "../../lib/api"
import { setSession } from "../../lib/session"
import { AuthCard, Field, FieldInput, FormError, PasswordStrengthHint, SubmitButton } from "./auth-form"
import { SLUG_PATTERN, toSlug } from "./slug"
import { useAuthForm } from "./use-auth-form"

export const LAST_CLINIC_KEY = "dentalops.lastClinic"

const SLUG_GUIDANCE = "Latin letters, numbers and hyphens — this becomes your public booking link."

const signupSchema = z.object({
  clinicName: z
    .string()
    .min(2, "Enter at least 2 characters")
    .max(80, "Keep the clinic name under 80 characters"),
  slug: z.string().regex(SLUG_PATTERN, SLUG_GUIDANCE),
  name: z.string().min(1, "Enter your name").max(80, "Keep your name under 80 characters"),
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(72, "Keep the password under 72 characters")
})

type SignupValues = z.infer<typeof signupSchema>

const initial = { clinicName: "", slug: "", name: "", email: "", password: "" }

const fieldForErrorCode = (code: string): string | null => (code === "SLUG_TAKEN" ? "slug" : null)

const rememberClinic = (slug: string): void => {
  try {
    localStorage.setItem(LAST_CLINIC_KEY, slug)
  } catch {
    return
  }
}

const bookingHost = (): string =>
  typeof window === "undefined" ? "" : `${window.location.host}/book/`

interface ReadyState {
  clinicName: string
  slug: string
}

const SETUP_CHECKLIST = [
  {
    icon: CalendarClock,
    title: "Set your branch hours",
    description: "Opening hours control when patients can book online."
  },
  {
    icon: Stethoscope,
    title: "Add your first service",
    description: "Treatments need a duration before they can appear on the schedule."
  },
  {
    icon: Users,
    title: "Invite your team",
    description: "Dentists and receptionists sign in once you've added them as staff."
  }
]

export const SignupPage = (): ReactElement => {
  const navigate = useNavigate()
  const slugEdited = useRef(false)
  const [ready, setReady] = useState<ReadyState | null>(null)

  const onSubmit = useCallback(async (values: SignupValues) => {
    const session = await api("/auth/signup", authSessionSchema, {
      method: "POST",
      body: values
    })
    setSession(session)
    rememberClinic(values.slug)
    setReady({ clinicName: values.clinicName, slug: values.slug })
  }, [])

  const form = useAuthForm({ schema: signupSchema, initial, onSubmit, fieldForErrorCode })

  if (ready) {
    return (
      <AuthCard title="You're ready" subtitle={`${ready.clinicName} is live. A few things make it feel complete.`}>
        <div className="space-y-5">
          <div className="rounded-control border border-border bg-surface-subtle p-3">
            <p className="text-sm font-medium text-foreground">Public booking link</p>
            <code className="mt-1 block break-all text-sm text-muted-foreground">
              {bookingHost()}
              {ready.slug}
            </code>
          </div>
          <ul className="space-y-3">
            {SETUP_CHECKLIST.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{title}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
              </li>
            ))}
          </ul>
          <Button
            className="h-11 w-full sm:h-10 font-semibold"
            onClick={() => void navigate("/app/timeline")}
          >
            Go to your clinic
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </AuthCard>
    )
  }

  const setClinicName = (value: string) => {
    form.set("clinicName", value)
    if (!slugEdited.current) form.set("slug", toSlug(value))
  }

  const setSlug = (value: string) => {
    slugEdited.current = true
    form.set("slug", value)
  }

  return (
    <AuthCard
      title="Create a clinic"
      subtitle="Your own schedule, roster and booking page in about two minutes."
      footer={
        <>
          Already have a clinic?{" "}
          <Link className="underline" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />

        <Field id="clinicName" label="Clinic name" error={form.errors.clinicName}>
          {(aria) => (
            <FieldInput
              {...aria}
              name="clinicName"
              type="text"
              autoComplete="organization"
              value={form.values.clinicName}
              onChange={(event) => setClinicName(event.target.value)}
            />
          )}
        </Field>

        <Field id="slug" label="Clinic URL" error={form.errors.slug} hint={SLUG_GUIDANCE}>
          {(aria) => (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
              <span aria-hidden="true" className="shrink-0 truncate text-sm text-muted-foreground">
                {bookingHost()}
              </span>
              <FieldInput
                {...aria}
                name="slug"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={form.values.slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </div>
          )}
        </Field>

        <Field id="name" label="Your name" error={form.errors.name}>
          {(aria) => (
            <FieldInput
              {...aria}
              name="name"
              type="text"
              autoComplete="name"
              value={form.values.name}
              onChange={(event) => form.set("name", event.target.value)}
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

        <Field id="password" label="Password" error={form.errors.password}>
          {(aria) => (
            <div className="space-y-1">
              <FieldInput
                {...aria}
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.values.password}
                onChange={(event) => form.set("password", event.target.value)}
              />
              <PasswordStrengthHint password={form.values.password} />
            </div>
          )}
        </Field>

        <SubmitButton pending={form.pending} pendingLabel="Creating your clinic…">
          Create clinic
        </SubmitButton>
      </form>
    </AuthCard>
  )
}
