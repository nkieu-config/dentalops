import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
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

export const LandingPage = () => {
  const navigate = useNavigate()
  const demoLogin = useMutation({
    mutationFn: (role: (typeof roles)[number]["role"]) =>
      api("/auth/demo-login", authSessionSchema, { method: "POST", body: { role } }),
    onSuccess: (session) => {
      setSession(session, { demo: true })
      void navigate("/app/timeline")
    },
    onError: (error) => {
      const asleep = !(error instanceof ApiError) || error.status >= 500
      toast.error(
        asleep
          ? "The demo API is waking up — free hosting sleeps after inactivity. Give it about a minute and try again."
          : error.message
      )
    }
  })

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-10 px-6 py-12">
      <div className="flex flex-col gap-5">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className="h-2.5 w-2.5 rounded-full bg-decorative" aria-hidden="true" />
          DentalOps
        </span>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
          Every chair, every dentist, one day at a glance.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Appointment and roster scheduling for dental clinics — live availability, double-booking
          caught by the database, and a public booking page per clinic. Pick a role and look around.
        </p>
      </div>

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
              <span className="text-sm font-normal opacity-80">{hint}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
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
      </div>
    </main>
  )
}
