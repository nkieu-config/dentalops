import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "../components/ui/button"
import { api } from "../lib/api"
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
    onError: () => toast.error("Demo login failed — is the API awake?")
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">DentalOps</h1>
        <p className="text-base text-muted-foreground">
          Multi-tenant appointment and roster scheduling for dental clinics
        </p>
      </div>
      <div className="space-y-3">
        {roles.map(({ role, label, hint }) => (
          <Button
            key={role}
            className="h-auto w-full flex-col items-start gap-1 py-3"
            variant={role === "owner" ? "default" : "secondary"}
            disabled={demoLogin.isPending}
            onClick={() => demoLogin.mutate(role)}
          >
            <span className="font-semibold">{label}</span>
            <span className="text-xs opacity-80">{hint}</span>
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        A demo clinic with seeded appointments. Data resets periodically.
      </p>
    </main>
  )
}
