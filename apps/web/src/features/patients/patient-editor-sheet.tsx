import { patientDetailSchema, type PatientDetail } from "@dentalops/contracts"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "../../components/ui/button"
import { Field, FieldInput, FormError } from "../../components/ui/form-field"
import { Sheet } from "../../components/ui/sheet"
import { api } from "../../lib/api"
import { PHONE_ERROR, isValidPhone, normalizePhone } from "../../lib/phone"
import { queryKeys } from "../../lib/query-keys"
import { useDiscardGuard } from "../../lib/use-discard-guard"
import { useAuthForm } from "../auth/use-auth-form"

const editablePatientSchema = patientDetailSchema.omit({ appointments: true })

type EditablePatient = Pick<PatientDetail, "id" | "name" | "phone" | "email" | "notes">

const patientFormSchema = z.object({
  name: z.string().trim().min(1, "Enter the patient's name.").max(120, "Keep the name under 120 characters"),
  phone: z.string().refine(isValidPhone, PHONE_ERROR).transform(normalizePhone),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a complete email address."),
  notes: z.string().trim().max(2000, "Keep the note under 2000 characters")
})

type PatientFormValues = z.input<typeof patientFormSchema>

const fieldForErrorCode = (code: string): string | null =>
  code === "DUPLICATE_PATIENT" ? "phone" : null

interface PatientEditorSheetProps {
  open: boolean
  patient?: EditablePatient
  onClose: () => void
  onSaved: (patient: EditablePatient) => void
}

export const PatientEditorSheet = ({ open, patient, onClose, onSaved }: PatientEditorSheetProps) =>
  open ? (
    <PatientEditorForm
      key={patient?.id ?? "new"}
      patient={patient}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : null

const PatientEditorForm = ({
  patient,
  onClose,
  onSaved
}: Omit<PatientEditorSheetProps, "open">) => {
  const queryClient = useQueryClient()

  const onSubmit = useCallback(
    async (values: z.output<typeof patientFormSchema>) => {
      const saved = await api(
        patient ? `/patients/${patient.id}` : "/patients",
        editablePatientSchema,
        { method: patient ? "PATCH" : "POST", body: values }
      )
      if (patient) {
        queryClient.setQueryData<PatientDetail>(queryKeys.patients.detail(patient.id), (current) =>
          current ? { ...current, ...saved } : current
        )
      }
      await queryClient.invalidateQueries({ queryKey: ["patients"] })
      toast.success(patient ? "Patient details updated" : "Patient added")
      onSaved(saved)
      onClose()
    },
    [onClose, onSaved, patient, queryClient]
  )

  const initial: PatientFormValues = {
    name: patient?.name ?? "",
    phone: patient?.phone ?? "",
    email: patient?.email ?? "",
    notes: patient?.notes ?? ""
  }
  const form = useAuthForm({ schema: patientFormSchema, initial, onSubmit, fieldForErrorCode })
  const discard = useDiscardGuard(form.dirty, onClose)

  return (
    <>
      <Sheet
        open
        onOpenChange={discard.requestClose}
        title={patient ? "Edit patient" : "New patient"}
        mobileLayout="adaptive"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => discard.requestClose(false)}>
              Cancel
            </Button>
            <Button
              form="patient-editor-form"
              type="submit"
              className="flex-1"
              disabled={form.pending}
              aria-busy={form.pending}
            >
              {form.pending ? "Saving…" : "Save patient"}
            </Button>
          </div>
        }
      >
        <form
          id="patient-editor-form"
          ref={form.formRef}
          className="space-y-5"
          onSubmit={form.submit}
          noValidate
        >
          <FormError message={form.formError} />
          <div className="space-y-4" aria-labelledby="patient-identity-heading">
            <h3 id="patient-identity-heading" className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">Patient identity</h3>
            <Field id="patient-editor-name" label="Patient name" error={form.errors.name}>
              {(aria) => (
                <FieldInput
                  {...aria}
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  value={form.values.name}
                  onChange={(event) => form.set("name", event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="space-y-4 border-t border-border pt-5" aria-labelledby="patient-contact-heading">
            <h3 id="patient-contact-heading" className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
            <Field id="patient-editor-phone" label="Phone" error={form.errors.phone}>
              {(aria) => (
                <FieldInput
                  {...aria}
                  name="phone"
                  type="tel"
                  className="tabular-nums"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0812345678"
                  value={form.values.phone}
                  onChange={(event) => form.set("phone", event.target.value)}
                />
              )}
            </Field>
            <Field id="patient-editor-email" label="Email (optional)" error={form.errors.email}>
              {(aria) => (
                <FieldInput
                  {...aria}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={form.values.email}
                  onChange={(event) => form.set("email", event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="border-t border-border pt-5">
            <Field id="patient-editor-notes" label="Front-desk note (optional)" error={form.errors.notes}>
              {(aria) => (
                <textarea
                  {...aria}
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  value={form.values.notes}
                  onChange={(event) => form.set("notes", event.target.value)}
                  className="min-h-28 w-full resize-y rounded-control border border-input bg-background px-3 py-2 type-body shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>
          </div>
        </form>
      </Sheet>
      {discard.dialog}
    </>
  )
}
