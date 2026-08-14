import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  ShieldCheck,
  Smartphone,
  Users
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { SchedulePreview } from "../components/schedule-preview"
import { PublicNav } from "../components/shell/public-nav"
import { BrandMark } from "../components/ui/brand-mark"
import { Button, buttonVariants } from "../components/ui/button"
import { api } from "../lib/api"
import { setSession } from "../lib/session"

const roles = [
  { role: "owner", label: "Try as Owner", hint: "Full control: timeline, roster, settings and activity" },
  {
    role: "receptionist",
    label: "Try as Receptionist",
    hint: "The booking desk: timeline and patients"
  },
  { role: "dentist", label: "Try as Dentist", hint: "Your own schedule" }
] as const

type DemoRole = (typeof roles)[number]["role"]

const outcomes = [
  "Nobody double-books a chair",
  "Patients book themselves in, day or night",
  "Every change shows up for the whole team at once"
]

const dayStory = [
  {
    time: "Morning",
    icon: Smartphone,
    title: "A patient books online",
    description:
      "Real availability, grouped by time of day, held for a few minutes while they fill in their details. No phone call needed."
  },
  {
    time: "Midday",
    icon: ClipboardList,
    title: "Reception keeps the day moving",
    description:
      "Holds, cancellations and walk-ins land on the same live schedule, so nobody double-books a chair by accident."
  },
  {
    time: "Afternoon",
    icon: CalendarDays,
    title: "The whole team shares one schedule",
    description: "The same timeline updates live for everyone watching it, from any chair."
  }
]

const capabilities = [
  {
    icon: CalendarDays,
    title: "Team Availability & Rostering",
    description: "Drag-and-drop staff scheduling, with coverage validation and shift-conflict checks built in."
  },
  {
    icon: Clock,
    title: "Real-Time Booking",
    description: "Double-booking blocked at the database, with every slot held automatically."
  },
  {
    icon: Users,
    title: "Patient & Clinic Directory",
    description: "Centralised patient visit history, quick contact details, and front-desk notes."
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access",
    description: "Everyone sees exactly what their role needs, and nothing more."
  }
]

const BAND = "py-16 sm:py-24"
const SHELL = "mx-auto max-w-6xl px-4 sm:px-6"
const BAND_TITLE = "type-page-title font-semibold tracking-tight lg:type-display"
const ICON_TILE = "flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-primary"
const FOOTER_LINK =
  "rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-inverse-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-surface-inverse"

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
    onError: (_error, role) => {
      setUnavailableRole(role)
    }
  })

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground selection:bg-selection">
      <a href="#main" className="sr-only rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Skip to main content</a>
      <PublicNav current="home" />

      <main id="main" className="flex-1">
        <section className={BAND}>
          <div className={SHELL}>
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="hero-enter flex flex-col gap-6 lg:col-span-7">
                <h1 className="type-display font-semibold tracking-tight text-balance lg:type-display-lg">
                  One shared schedule, so nobody's guessing what's next.
                </h1>
                <p className="max-w-xl type-body text-muted-foreground sm:type-subsection-title">
                  The whole clinic works off one schedule that's always up to date — the front desk, every
                  chair, and the patient booking online.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Link to="/signup" className={buttonVariants({ className: "px-6 sm:h-10" })}>
                    Create your clinic
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <a
                    href="#explore-demo"
                    className={buttonVariants({
                      variant: "secondary",
                      className: "border border-border px-6 sm:h-10"
                    })}
                  >
                    Explore the demo
                  </a>
                </div>

                <ul className="flex flex-col gap-2.5 border-t border-border pt-6">
                  {outcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2.5 type-body text-muted-foreground">
                      <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {outcome}
                    </li>
                  ))}
                </ul>

                <p className="type-ui text-muted-foreground">
                  Already have a clinic?{" "}
                  <Link
                    className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                    to="/login"
                  >
                    Sign in
                  </Link>
                </p>
              </div>

              <section
                id="explore-demo"
                aria-label="Try the demo"
                style={{ animationDelay: "80ms" }}
                className="hero-enter overflow-hidden rounded-hero border border-border bg-card p-6 shadow-md lg:col-span-5"
              >
                <div>
                  <p className="type-meta font-semibold uppercase tracking-wider text-muted-foreground">
                    Bangkok Central Branch
                  </p>
                  <p className="type-card-title font-semibold">A Tuesday, three chairs</p>
                </div>

                <SchedulePreview className="mt-5" />

                <p className="mt-4 type-supporting text-muted-foreground">
                  Each color is a booked service. Empty space is open.
                </p>

                <div className="mt-6 border-t border-border pt-5">
                  <p className="type-card-title font-semibold">Step into this clinic</p>
                  <p className="mt-1 type-supporting text-muted-foreground">
                    Pick a role and look around with sample data.
                  </p>

                  {unavailableRole ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-control border border-warning bg-warning-surface p-4 text-warning-on-surface"
                    >
                      <p className="type-ui font-semibold">Interactive demo is temporarily unavailable</p>
                      <p className="mt-1 type-ui leading-relaxed">We could not open the demo right now.</p>
                      <Button
                        className="mt-3"
                        variant="secondary"
                        disabled={demoLogin.isPending}
                        onClick={() => demoLogin.mutate(unavailableRole)}
                      >
                        Try demo again
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2.5">
                      {roles.map(({ role, label, hint }) => (
                        <Button
                          key={role}
                          className="h-auto w-full justify-between gap-4 px-4 py-3 text-left sm:h-auto"
                          variant={role === "owner" ? "default" : "secondary"}
                          disabled={demoLogin.isPending}
                          onClick={() => demoLogin.mutate(role)}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="type-ui font-semibold">
                              {demoLogin.isPending && demoLogin.variables === role ? "Signing in…" : label}
                            </span>
                            <span
                              className={
                                role === "owner"
                                  ? "type-meta font-normal text-primary-foreground"
                                  : "type-meta font-normal opacity-80"
                              }
                            >
                              {hint}
                            </span>
                          </span>
                          <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
                        </Button>
                      ))}
                    </div>
                  )}

                  <p className="mt-4 type-meta text-muted-foreground">
                    Sample clinic data. Resets periodically.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className={`border-t border-border bg-surface-band ${BAND}`}>
          <div className={SHELL}>
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className={BAND_TITLE}>Built for real clinic operations</h2>
              <p className="mt-3 type-body text-muted-foreground">
                What keeps a full schedule from turning into chaos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex flex-col gap-3 rounded-card border border-border bg-card p-6 shadow-xs"
                >
                  <span className={ICON_TILE}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="type-card-title font-semibold">{title}</h3>
                  <p className="type-supporting leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`border-t border-border ${BAND}`}>
          <div className={SHELL}>
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className={BAND_TITLE}>One clinic day, three moments</h2>
              <p className="mt-3 type-body text-muted-foreground">
                The same schedule, three points of view.
              </p>
            </div>

            <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
              {dayStory.map(({ time, icon: Icon, title, description }) => (
                <li key={title} className="flex flex-col gap-3">
                  <span className={ICON_TILE}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="type-meta font-semibold uppercase tracking-wider text-muted-foreground">
                    {time}
                  </span>
                  <h3 className="type-card-title font-semibold">{title}</h3>
                  <p className="type-supporting leading-relaxed text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`border-t border-border bg-surface-band ${BAND}`}>
          <div className={`${SHELL} flex flex-col items-center gap-6 text-center`}>
            <h2 className={`${BAND_TITLE} max-w-2xl text-balance`}>
              Put your whole clinic on one schedule.
            </h2>
            <p className="max-w-2xl type-body text-balance text-muted-foreground">
              Create a clinic in a minute, or look around the demo first — no sign-up needed.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/signup" className={buttonVariants({ className: "px-6 sm:h-10" })}>
                Create your clinic
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#explore-demo"
                className={buttonVariants({
                  variant: "secondary",
                  className: "border border-border px-6 sm:h-10"
                })}
              >
                Explore the demo
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-inverse py-12 text-surface-inverse-foreground sm:py-16">
        <div className={SHELL}>
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="flex flex-col gap-3">
              <Link to="/" className={`flex w-fit items-center gap-2.5 type-subsection-title font-semibold tracking-tight ${FOOTER_LINK}`}>
                <BrandMark className="size-9" />
                <span>DentalOps</span>
              </Link>
              <p className="max-w-xs type-ui">
                One shared schedule for the front desk, every chair, and the patient booking online.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:gap-x-16">
              <nav aria-label="Product">
                <p className="type-meta font-semibold uppercase tracking-wider">Product</p>
                <ul className="mt-3 flex flex-col gap-2 type-ui">
                  <li>
                    <a href="#explore-demo" className={FOOTER_LINK}>
                      Explore the demo
                    </a>
                  </li>
                  <li>
                    <Link to="/signup" className={FOOTER_LINK}>
                      Create a clinic
                    </Link>
                  </li>
                </ul>
              </nav>
              <nav aria-label="Account">
                <p className="type-meta font-semibold uppercase tracking-wider">Account</p>
                <ul className="mt-3 flex flex-col gap-2 type-ui">
                  <li>
                    <Link to="/login" className={FOOTER_LINK}>
                      Sign in
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          <p className="mt-10 border-t border-surface-inverse-border pt-6 type-meta">
            © 2026 DentalOps. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
