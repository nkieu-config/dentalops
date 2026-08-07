import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, Sparkles } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { ClinicDayStory } from "../components/public/clinic-day-story"
import { PublicHeader } from "../components/shell/public-header"
import { Button } from "../components/ui/button"
import { api, ApiError } from "../lib/api"
import { setSession } from "../lib/session"

const roles = [
  { role: "owner", label: "Try as Owner", hint: "Full control — roster, settings, reports" },
  {
    role: "receptionist",
    label: "Try as Receptionist",
    hint: "The booking desk — timeline and patients"
  },
  { role: "dentist", label: "Try as Dentist", hint: "Your own schedule" }
] as const

type DemoRole = (typeof roles)[number]["role"]

export const LandingPage = () => {
  const navigate = useNavigate()
  const [unavailableRole, setUnavailableRole] = useState<DemoRole | null>(null)
  const demoLogin = useMutation({
    mutationFn: (role: DemoRole) =>
      api("/auth/demo-login", authSessionSchema, { method: "POST", body: { role } }),
    onSuccess: (session) => {
      setSession(session, { demo: true })
      void navigate("/app/timeline")
    },
    onError: (error, role) => {
      const asleep = !(error instanceof ApiError) || error.status >= 500
      if (asleep) {
        setUnavailableRole(role)
        return
      }
      toast.error(error.message)
    }
  })

  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader
        actions={
          <>
            <a className="text-sm font-medium hover:text-muted-foreground" href="#demo-day">
              Explore the demo
            </a>
            <Link className="text-sm font-semibold hover:text-muted-foreground" to="/signup">
              Create your clinic
            </Link>
          </>
        }
      />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12 sm:gap-14 sm:py-16">
        <section className="grid gap-6 rounded-card border border-border bg-card p-6 shadow-xs sm:grid-cols-[1.2fr_0.8fr] sm:p-8">
          <div className="flex flex-col items-start gap-5">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-wide text-decorative">
              <Sparkles className="h-4 w-4" aria-hidden />
              DENTALOPS
            </span>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              A calmer clinic day starts here.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Coordinate people, chairs and patient bookings in one schedule your whole clinic can
              understand at a glance.
            </p>
            <a
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              href="#demo-day"
            >
              Explore a clinic day
            </a>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-5 text-secondary-foreground">
            <p className="text-sm font-semibold tracking-wide">A SHARED RHYTHM</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">Patients book. Teams coordinate. Care keeps moving.</p>
            <p className="mt-4 text-sm leading-relaxed opacity-80">
              Built around the actual availability of your clinicians, rooms and equipment.
            </p>
          </div>
        </section>

        <ClinicDayStory />

        <section id="demo-day" aria-labelledby="demo-day-title" className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold tracking-wide text-decorative">EXPLORE THE WORKSPACE</p>
            <h2 id="demo-day-title" className="text-2xl font-semibold tracking-tight">
              Step into a clinic day
            </h2>
            <p className="text-base text-muted-foreground">
              Open the same demo clinic from the perspective of each role.
            </p>
          </div>
          <div className="flex flex-col gap-3">
        {unavailableRole ? (
          <section
            aria-live="polite"
            className="rounded-md border border-warning bg-warning-surface p-4 text-warning-on-surface"
          >
            <h2 className="text-base font-semibold">Interactive demo is temporarily unavailable</h2>
            <p className="mt-2 text-sm leading-relaxed">
              The hosted demo is unavailable right now. Try again shortly, or run the project locally
              with <code className="font-semibold">pnpm dev</code>.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              disabled={demoLogin.isPending}
              onClick={() => demoLogin.mutate(unavailableRole)}
            >
              Try demo again
            </Button>
          </section>
          ) : (
          roles.map(({ role, label, hint }) => (
            <Button
              key={role}
              className="h-auto w-full justify-between gap-4 px-4 py-3.5 text-left sm:h-auto"
              variant={role === "owner" ? "default" : "secondary"}
              disabled={demoLogin.isPending}
              onClick={() => demoLogin.mutate(role)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-semibold">{label}</span>
                <span
                  className={
                    role === "owner"
                      ? "text-sm font-normal text-primary-foreground"
                      : "text-sm font-normal opacity-80"
                  }
                >
                  {hint}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
            </Button>
          ))
          )}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            A demo clinic with seeded appointments. Data resets periodically.
          </p>
          <p className="text-base">
            Already have a clinic?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-muted-foreground"
              to="/login"
            >
              Sign in
            </Link>{" "}
            ·{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-muted-foreground"
              to="/signup"
            >
              Create a clinic
            </Link>
          </p>
        </footer>
      </main>
    </div>
  )
}
