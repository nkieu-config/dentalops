import { staffMemberSchema } from "@dentalops/contracts"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, type ReactElement } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { api } from "../../lib/api"
import { useOnline } from "../../lib/use-online"
import { Field, FieldInput, FormError, SubmitButton } from "../auth/auth-form"
import { useAuthForm } from "../auth/use-auth-form"

const OFFLINE_REASON_ID = "staff-dialog-offline-reason"

const staffSchema = z.object({
  name: z.string().min(1, "Enter their name").max(80, "Keep the name under 80 characters"),
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(72, "Keep the password under 72 characters"),
  role: z.enum(["dentist", "receptionist"])
})

type StaffValues = z.infer<typeof staffSchema>

const initial = { name: "", email: "", password: "", role: "dentist" }

const ROLES: Array<{ value: StaffValues["role"]; label: string }> = [
  { value: "dentist", label: "Dentist — takes appointments" },
  { value: "receptionist", label: "Receptionist — books and manages the desk" }
]

const fieldForErrorCode = (code: string): string | null => (code === "EMAIL_TAKEN" ? "email" : null)

interface StaffDialogProps {
  onClose: () => void
}

export const StaffDialog = ({ onClose }: StaffDialogProps): ReactElement => {
  const queryClient = useQueryClient()
  const online = useOnline()

  const onSubmit = useCallback(
    async (values: StaffValues) => {
      const member = await api("/staff", staffMemberSchema, { method: "POST", body: values })
      await queryClient.invalidateQueries({ queryKey: ["staff"] })
      toast.success(`${member.name} joined the clinic`)
      onClose()
    },
    [onClose, queryClient]
  )

  const form = useAuthForm({ schema: staffSchema, initial, onSubmit, fieldForErrorCode })

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Add a colleague"
    >
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />

        <Field id="staff-name" label="Name" error={form.errors.name}>
          {(aria) => (
            <FieldInput
              {...aria}
              name="name"
              type="text"
              autoComplete="off"
              value={form.values.name}
              onChange={(event) => form.set("name", event.target.value)}
            />
          )}
        </Field>

        <Field id="staff-email" label="Email" error={form.errors.email}>
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

        <Field
          id="staff-password"
          label="Password"
          error={form.errors.password}
          hint="They can change it once they sign in."
        >
          {(aria) => (
            <FieldInput
              {...aria}
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.values.password}
              onChange={(event) => form.set("password", event.target.value)}
            />
          )}
        </Field>

        <Field id="staff-role" label="Role" error={form.errors.role}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="role"
              className="h-11 sm:h-9"
              value={form.values.role}
              onChange={(event) => form.set("role", event.target.value)}
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {online ? null : (
          <p id={OFFLINE_REASON_ID} className="text-sm font-medium text-destructive">
            {OFFLINE_MESSAGE}
          </p>
        )}

        <SubmitButton
          pending={form.pending}
          pendingLabel="Adding…"
          disabled={!online}
          title={online ? undefined : OFFLINE_MESSAGE}
          describedBy={online ? undefined : OFFLINE_REASON_ID}
        >
          Add colleague
        </SubmitButton>
      </form>
    </Sheet>
  )
}
