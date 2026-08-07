import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, CalendarDays, Clock, ShieldCheck, Users, Sparkles } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
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

const capabilities = [
  {
    icon: CalendarDays,
    title: "Team Availability & Rostering",
    description: "Drag-and-drop staff scheduling with built-in coverage validation and shift conflicts prevention."
  },
  {
    icon: Clock,
    title: "Real-time Booking Engine",
    description: "Double-booking protection enforced directly by database constraints and automatic slot holding."
  },
  {
    icon: Users,
    title: "Patient & Clinic Directory",
    description: "Centralised patient visit history, quick contact details, and front-desk notes."
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access",
    description: "Granular tenant boundary safety so receptionists, dentists, and owners see only what they need."
  }
]

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
    <div className="min-h-dvh bg-background text-foreground flex flex-col selection:bg-selection">
      {/* Public Navigation Bar */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-control bg-decorative text-primary-foreground font-bold shadow-xs">
              D
            </span>
            <span>DentalOps</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-4">
            <a
              href="#explore-demo"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Explore demo
            </a>
            <Link
              to="/login"
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-control border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-xs hover:bg-surface-subtle transition-colors"
            >
              Create a clinic
            </Link>
          </nav>
        </div>
      </div>

      {/* Hero Canvas */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-12 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-3.5 py-1 text-xs font-semibold text-muted-foreground w-fit">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>Careful Joy Rebrand</span>
                </div>
                <h1 className="text-display font-bold tracking-tight text-balance text-3xl sm:text-4xl lg:text-5xl">
                  Every chair, every dentist, one day at a glance.
                </h1>
                <p className="text-body text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl">
                  Appointment and roster scheduling for dental clinics — live availability, double-booking
                  caught by the database, and a public booking page per clinic. Pick a role and look around.
                </p>

                {/* Role Exploration Module */}
                <div id="explore-demo" className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-card p-6 shadow-xs">
                  <div className="flex flex-col gap-1 mb-2">
                    <h2 className="text-card-title font-bold">Step into a clinic day</h2>
                    <p className="text-supporting text-muted-foreground">Explore pre-seeded clinic data with role-specific views.</p>
                  </div>

                  {unavailableRole ? (
                    <section
                      aria-live="polite"
                      className="rounded-control border border-warning bg-warning-surface p-4 text-warning-on-surface"
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
                    <div className="flex flex-col gap-3">
                      {roles.map(({ role, label, hint }) => (
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
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
                  <p>A demo clinic with seeded appointments. Data resets periodically.</p>
                  <p className="text-base shrink-0">
                    Already have a clinic?{" "}
                    <Link
                      className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
                      to="/login"
                    >
                      Sign in
                    </Link>{" "}
                    ·{" "}
                    <Link
                      className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
                      to="/signup"
                    >
                      Create a clinic
                    </Link>
                  </p>
                </div>
              </div>

              {/* Calm Schedule Illustration Surface */}
              <div className="lg:col-span-5">
                <div className="relative rounded-hero border border-border bg-card p-6 shadow-md overflow-hidden">
                  <div className="absolute -top-12 -right-12 size-48 rounded-full bg-accent/50 blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                    <div>
                      <div className="text-meta font-bold text-muted-foreground uppercase tracking-wider">Today's Schedule</div>
                      <div className="text-card-title font-bold">Bangkok Central Branch</div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-xs font-semibold text-success-on-surface">
                      <span className="size-2 rounded-full bg-success animate-pulse" />
                      Live Roster
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-card border border-border bg-surface-subtle p-3.5 flex items-start gap-3">
                      <div className="size-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                        DR
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Dr. Somchai (Chair 1)</span>
                          <span className="text-muted-foreground">09:00 - 10:00</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Scaling & Polishing — Patient: Jane Doe</p>
                      </div>
                    </div>

                    <div className="rounded-card border border-border bg-selection p-3.5 flex items-start gap-3">
                      <div className="size-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-xs shrink-0">
                        DR
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Dr. Kanya (Chair 2)</span>
                          <span className="text-primary font-bold">10:30 - 11:30</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Root Canal Treatment — Reserved</p>
                      </div>
                    </div>

                    <div className="rounded-card border border-dashed border-border bg-card p-3.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>11:30 - 12:30 Slot Available</span>
                      <span className="font-semibold text-primary">Bookable</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capability Proof Section */}
        <section className="border-t border-border bg-surface-subtle py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-section-title font-bold">Built for real clinic operations</h2>
              <p className="text-supporting text-muted-foreground mt-2">
                Designed to simplify daily workflows for receptionists, dentists, and clinic owners.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-card border border-border bg-card p-6 shadow-xs flex flex-col gap-3">
                  <div className="size-10 rounded-control bg-accent flex items-center justify-center text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-card-title font-bold">{title}</h3>
                  <p className="text-supporting text-muted-foreground leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 DentalOps. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">Create clinic</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

