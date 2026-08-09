import {
  branchSettingsSchema,
  clinicProfileSchema,
  createBranchSchema,
  createResourceSchema,
  createServiceSchema,
  equipmentTypeSchema,
  resourceSettingsSchema,
  serviceSummarySchema,
  staffMemberSchema,
  updateClinicProfileSchema,
  updateStaffSchema,
  type BranchSettings,
  type OpeningHours,
  type ResourceSettings,
  type ServiceSummary,
  type StaffMember
} from "@dentalops/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, CalendarClock, MapPin, Settings2, Users, Wrench } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Input } from "../../components/ui/input"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { api } from "../../lib/api"
import { useSession } from "../../lib/session"
import { Field, FieldInput, FormError } from "../auth/auth-form"
import { useAuthForm } from "../auth/use-auth-form"
import { StaffDialog } from "../staff/staff-dialog"

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"]
] as const

type Day = (typeof DAYS)[number][0]

const defaultOpeningHours = (): OpeningHours => ({
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [],
  sun: []
})

const profileFormSchema = updateClinicProfileSchema
const branchFormSchema = createBranchSchema
const serviceFormSchema = createServiceSchema
const resourceFormSchema = createResourceSchema
const staffFormSchema = updateStaffSchema

const sectionItems = [
  ["clinic", "Clinic profile", Building2],
  ["branches", "Branches", MapPin],
  ["services", "Services", CalendarClock],
  ["resources", "Resources", Wrench],
  ["staff", "Staff", Users]
] as const



const Section = ({
  id,
  title,
  description,
  action,
  children
}: {
  id: string
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section id={id} className="scroll-mt-20">
    <Card>
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  </section>
)

const StateBadge = ({ active }: { active: boolean }) => (
  <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
)

const RecordRow = ({
  active,
  children,
  actions
}: {
  active: boolean
  children: ReactNode
  actions: ReactNode
}) => (
  <div className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center">
    <div className="min-w-0 flex-1">{children}</div>
    <div className="flex flex-wrap items-center gap-2">
      <StateBadge active={active} />
      {actions}
    </div>
  </div>
)

const ClinicProfileSection = () => {
  const query = useQuery({ queryKey: ["tenant"], queryFn: () => api("/tenant", clinicProfileSchema) })
  const client = useQueryClient()
  
  const form = useAuthForm({
    schema: profileFormSchema,
    initial: { name: query.data?.name ?? "", slug: query.data?.slug ?? "" },
    fieldForErrorCode: (code) => (code === "SLUG_TAKEN" ? "slug" : null),
    onSubmit: async (values) => {
      const saved = await api("/tenant", clinicProfileSchema, { method: "PATCH", body: values })
      client.setQueryData(["tenant"], saved)
      toast.success("Clinic profile saved")
    }
  })

  // Sync initial values when data loads
  if (query.data && form.values.name === "" && form.values.slug === "") {
    form.set("name", query.data.name)
    form.set("slug", query.data.slug)
  }

  if (query.isPending) {
    return (
      <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
        <p className="text-sm text-muted-foreground">Loading clinic profile…</p>
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
        <EmptyState icon={Settings2} title="Could not load clinic profile" hint="Retry shortly." />
      </Section>
    )
  }

  const publicUrl = `${window.location.origin}/book/${form.values.slug}`

  return (
    <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
          <FormError message={form.formError} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="clinic-name" label="Clinic name" error={form.errors.name}>
              {(aria) => (
                <FieldInput
                  {...aria}
                  name="name"
                  value={form.values.name}
                  onChange={(event) => form.set("name", event.target.value)}
                />
              )}
            </Field>
            <Field id="clinic-slug" label="Booking URL" error={form.errors.slug} hint="Lowercase letters, numbers and hyphens.">
              {(aria) => (
                <FieldInput
                  {...aria}
                  name="slug"
                  value={form.values.slug}
                  onChange={(event) => form.set("slug", event.target.value)}
                />
              )}
            </Field>
          </div>
          
          <div className="rounded-md border border-border bg-surface-subtle p-3">
            <p className="mb-2 text-sm font-medium text-foreground">Public booking link</p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                tabIndex={0}
                className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1.5 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {publicUrl}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl)
                  toast.success("Copied link")
                }}
              >
                Copy
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.open(`/book/${form.values.slug}`, "_blank")
                }}
              >
                Open
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
              {form.pending ? "Saving…" : "Save clinic"}
            </Button>
          </div>
        </form>

        <div className="hidden lg:block">
          <p className="mb-3 text-sm font-medium text-foreground">Patient preview</p>
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm ring-4 ring-surface-subtle">
            <div className="h-24 bg-primary/10"></div>
            <div className="px-5 pb-6 pt-5">
              <div className="mb-4 h-12 w-12 rounded-xl bg-primary shadow-xs"></div>
              <p className="mb-1 text-lg font-semibold tracking-tight text-foreground line-clamp-1">{form.values.name || "Clinic Name"}</p>
              <p className="text-sm text-muted-foreground">Book an appointment online</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

const OpeningHoursEditor = ({
  value,
  onChange,
  error
}: {
  value: OpeningHours
  onChange: (next: OpeningHours) => void
  error?: string
}) => {
  const updateDay = (day: Day, next: Array<[string, string]>) => onChange({ ...value, [day]: next })
  const copyToWeekdays = (fromDay: Day) => {
    const intervals = value[fromDay]
    onChange({
      ...value,
      mon: intervals,
      tue: intervals,
      wed: intervals,
      thu: intervals,
      fri: intervals,
    })
    toast.success(`Copied ${DAYS.find(d => d[0] === fromDay)?.[1]} hours to all weekdays`)
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Opening hours</legend>
      <div className="space-y-3">
        {DAYS.map(([day, label]) => {
          const intervals = value[day]
          const isOpen = intervals.length > 0
          
          return (
            <div key={day} className="rounded-md border border-border bg-card p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={isOpen}
                    onChange={(e) => {
                      if (e.target.checked) updateDay(day, [["09:00", "17:00"]])
                      else updateDay(day, [])
                    }}
                  />
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToWeekdays(day)}
                    title="Copy these hours to Monday-Friday"
                  >
                    Copy to weekdays
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => updateDay(day, [...intervals, ["09:00", "17:00"]])}
                  >
                    Add hours
                  </Button>
                </div>
              </div>
              
              {!isOpen ? (
                <p className="pl-7 text-sm text-muted-foreground">Closed</p>
              ) : (
                <div className="space-y-2 pl-7">
                  {intervals.map(([start, end], index) => (
                    <div key={`${day}-${index}`} className="flex items-center gap-2">
                      <Input
                        id={`${day}-open-${index}`}
                        type="time"
                        className="min-h-11 tabular-nums"
                        aria-label={`${label} opening ${index + 1} starts`}
                        value={start}
                        onChange={(event) => {
                          const next = intervals.map((interval, intervalIndex) =>
                            intervalIndex === index ? [event.target.value, interval[1]] as [string, string] : interval
                          )
                          updateDay(day, next)
                        }}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        className="min-h-11 tabular-nums"
                        aria-label={`${label} opening ${index + 1} ends`}
                        value={end}
                        onChange={(event) => {
                          const next = intervals.map((interval, intervalIndex) =>
                            intervalIndex === index ? [interval[0], event.target.value] as [string, string] : interval
                          )
                          updateDay(day, next)
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${label} hours ${index + 1}`}
                        onClick={() => updateDay(day, intervals.filter((_, intervalIndex) => intervalIndex !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </fieldset>
  )
}

const useDiscardGuard = (dirty: boolean, onClose: () => void) => {
  const [confirming, setConfirming] = useState(false)
  const requestClose = (open: boolean) => {
    if (open) return
    if (dirty) {
      setConfirming(true)
      return
    }
    onClose()
  }
  const dialog = (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => { if (!open) setConfirming(false) }}
      title="Discard changes?"
      description="You have unsaved changes. Are you sure you want to discard them?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={() => { setConfirming(false); onClose() }}
    />
  )
  return { requestClose, dialog }
}

const BranchesSection = () => {
  const query = useQuery({ queryKey: ["branches", "settings"], queryFn: () => api("/branches", z.array(branchSettingsSchema)) })
  const client = useQueryClient()
  const [branchSheet, setBranchSheet] = useState<BranchSettings | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/branches/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: ["branches", "settings"] })
    toast.success("Branch deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/branches/${id}`, branchSettingsSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<BranchSettings[]>(["branches", "settings"], (current = []) =>
      current.map((branch) => (branch.id === saved.id ? saved : branch))
    )
    toast.success("Branch reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings.">
        <p className="text-sm text-muted-foreground">Loading branches…</p>
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings.">
        <EmptyState icon={Settings2} title="Could not load branches" hint="Retry shortly." />
      </Section>
    )
  }

  const active = query.data.filter((b) => b.isActive)
  const inactive = query.data.filter((b) => !b.isActive)

  return (
    <>
      <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings." action={<Button onClick={() => setBranchSheet(null)}>Add branch</Button>}>
        <div className="space-y-6">
          {active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-foreground">Active locations</h3>
              {active.map((branch) => (
                <RecordRow key={branch.id} active={branch.isActive} actions={<><Button variant="secondary" onClick={() => setBranchSheet(branch)}>Edit</Button><Button variant="ghost" onClick={() => setDeactivating({ id: branch.id, name: branch.name })}>Deactivate</Button></>}>
                  <p className="font-medium">{branch.name}</p>
                  <p className="text-sm text-muted-foreground">{branch.timezone}</p>
                </RecordRow>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No active branches.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-muted-foreground">Inactive locations</h3>
              {inactive.map((branch) => (
                <RecordRow key={branch.id} active={branch.isActive} actions={<><Button variant="secondary" onClick={() => setBranchSheet(branch)}>Edit</Button><Button variant="secondary" onClick={() => reactivate(branch.id)}>Reactivate</Button></>}>
                  <p className="font-medium text-muted-foreground">{branch.name}</p>
                  <p className="text-sm text-muted-foreground">{branch.timezone}</p>
                </RecordRow>
              ))}
            </div>
          ) : null}
        </div>
      </Section>
      {branchSheet !== undefined ? <BranchSheet value={branchSheet} onClose={() => setBranchSheet(undefined)} /> : null}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => { if (!open) setDeactivating(null) }} title="Deactivate branch?" description={`Are you sure you want to deactivate "${deactivating?.name}"? Existing booking history stays intact, but no new bookings can be made here.`} confirmLabel="Deactivate" onConfirm={deactivate} />
    </>
  )
}

const BranchSheet = ({ value, onClose }: { value: BranchSettings | null; onClose: () => void }) => {
  const client = useQueryClient()
  const form = useAuthForm({
    schema: branchFormSchema,
    initial: value
      ? { name: value.name, timezone: value.timezone, openingHours: value.openingHours as OpeningHours }
      : { name: "", timezone: "Asia/Bangkok", openingHours: defaultOpeningHours() },
    onSubmit: async (values) => {
      const saved = await api(value ? `/branches/${value.id}` : "/branches", branchSettingsSchema, {
        method: value ? "PATCH" : "POST",
        body: values
      })
      client.setQueryData<BranchSettings[]>(["branches", "settings"], (current = []) =>
        value ? current.map((branch) => (branch.id === saved.id ? saved : branch)) : [...current, saved]
      )
      toast.success(value ? "Branch saved" : "Branch added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)
  return (
    <>
      <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit branch" : "Add branch"}>
        <form ref={form.formRef} onSubmit={form.submit} noValidate className="flex h-full flex-col space-y-4">
          <FormError message={form.formError} />
          <Field id="branch-name" label="Branch name" error={form.errors.name}>
            {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
          </Field>
          <Field id="branch-timezone" label="Timezone" error={form.errors.timezone}>
            {(aria) => (
              <div>
                <FieldInput {...aria} name="timezone" value={form.values.timezone} onChange={(event) => form.set("timezone", event.target.value)} disabled={true} />
                <p className="mt-2 text-sm text-muted-foreground">Note: Currently locked to <span className="font-medium text-foreground">Asia/Bangkok</span> for all branches.</p>
              </div>
            )}
          </Field>
          <OpeningHoursEditor
            value={form.values.openingHours}
            onChange={(openingHours) => form.set("openingHours", openingHours)}
            error={form.errors.openingHours}
          />
          <Button type="submit" className="w-full" disabled={form.pending} aria-busy={form.pending}>
            {form.pending ? "Saving…" : "Save branch"}
          </Button>
        </form>
      </Sheet>
      {discardGuard.dialog}
    </>
  )
}

const ServicesSection = () => {
  const query = useQuery({ queryKey: ["services", "settings"], queryFn: () => api("/services", z.array(serviceSummarySchema)) })
  const client = useQueryClient()
  const [serviceSheet, setServiceSheet] = useState<ServiceSummary | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/services/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: ["services", "settings"] })
    toast.success("Service deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/services/${id}`, serviceSummarySchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<ServiceSummary[]>(["services", "settings"], (current = []) =>
      current.map((service) => (service.id === saved.id ? saved : service))
    )
    toast.success("Service reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic.">
        <p className="text-sm text-muted-foreground">Loading services…</p>
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic.">
        <EmptyState icon={Settings2} title="Could not load services" hint="Retry shortly." />
      </Section>
    )
  }

  const active = query.data.filter((s) => s.isActive)
  const inactive = query.data.filter((s) => !s.isActive)

  return (
    <>
      <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic." action={<Button onClick={() => setServiceSheet(null)}>Add service</Button>}>
        <div className="space-y-6">
          {active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-foreground">Active services</h3>
              {active.map((service) => (
                <RecordRow key={service.id} active={service.isActive} actions={<><Button variant="secondary" onClick={() => setServiceSheet(service)}>Edit</Button><Button variant="ghost" onClick={() => setDeactivating({ id: service.id, name: service.name })}>Deactivate</Button></>}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded-full bg-appointment-${service.colorIndex} border border-appointment-${service.colorIndex}-border`} />
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{service.durationMin} min + {service.bufferMin} min buffer</p>
                    </div>
                  </div>
                </RecordRow>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No active services.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-muted-foreground">Inactive services</h3>
              {inactive.map((service) => (
                <RecordRow key={service.id} active={service.isActive} actions={<><Button variant="secondary" onClick={() => setServiceSheet(service)}>Edit</Button><Button variant="secondary" onClick={() => reactivate(service.id)}>Reactivate</Button></>}>
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded-full bg-appointment-${service.colorIndex} border border-appointment-${service.colorIndex}-border opacity-50`} />
                    <div>
                      <p className="font-medium text-muted-foreground">{service.name}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{service.durationMin} min + {service.bufferMin} min buffer</p>
                    </div>
                  </div>
                </RecordRow>
              ))}
            </div>
          ) : null}
        </div>
      </Section>
      {serviceSheet !== undefined ? <ServiceSheet value={serviceSheet} onClose={() => setServiceSheet(undefined)} /> : null}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => { if (!open) setDeactivating(null) }} title="Deactivate service?" description={`Are you sure you want to deactivate "${deactivating?.name}"? Existing booking history stays intact, but no new bookings can use this service.`} confirmLabel="Deactivate" onConfirm={deactivate} />
    </>
  )
}

const ServiceSheet = ({ value, onClose }: { value: ServiceSummary | null; onClose: () => void }) => {
  const client = useQueryClient()
  const form = useAuthForm({
    schema: serviceFormSchema,
    initial: value
      ? { name: value.name, durationMin: value.durationMin, bufferMin: value.bufferMin, colorIndex: value.colorIndex }
      : { name: "", durationMin: 30, bufferMin: 0, colorIndex: 0 },
    onSubmit: async (values) => {
      const saved = await api(value ? `/services/${value.id}` : "/services", serviceSummarySchema, {
        method: value ? "PATCH" : "POST",
        body: values
      })
      client.setQueryData<ServiceSummary[]>(["services", "settings"], (current = []) =>
        value ? current.map((service) => (service.id === saved.id ? saved : service)) : [...current, saved]
      )
      toast.success(value ? "Service saved" : "Service added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)

  return (
    <>
    <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit service" : "Add service"}>
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="flex flex-col space-y-4">
        <FormError message={form.formError} />
        
        {/* Timeline Preview */}
        <div className="mb-4 rounded-xl border border-border bg-surface-subtle p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline preview</p>
          <div className={`relative flex flex-col rounded-md border bg-appointment-${form.values.colorIndex} border-appointment-${form.values.colorIndex}-border p-3 shadow-xs transition-colors`} style={{ height: "6rem" }}>
            <div className={`absolute left-0 top-0 h-full w-1 rounded-l-md bg-appointment-${form.values.colorIndex}-border`} />
            <p className={`font-semibold text-appointment-${form.values.colorIndex}-text`}>{form.values.name || "Service Name"}</p>
            <p className={`text-sm font-medium text-appointment-${form.values.colorIndex}-text`}>Patient Name</p>
            <p className={`mt-auto text-xs font-medium text-appointment-${form.values.colorIndex}-text/80`}>{form.values.durationMin} min</p>
          </div>
        </div>

        <Field id="service-name" label="Service name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        
        <div className="grid grid-cols-2 gap-3">
          <Field id="service-duration" label="Duration (minutes)" error={form.errors.durationMin}>
            {(aria) => <FieldInput {...aria} name="durationMin" type="number" min="15" max="480" inputMode="numeric" value={form.values.durationMin} onChange={(event) => form.set("durationMin", Number(event.target.value))} />}
          </Field>
          <Field id="service-buffer" label="Buffer (minutes)" error={form.errors.bufferMin}>
            {(aria) => <FieldInput {...aria} name="bufferMin" type="number" min="0" max="120" inputMode="numeric" value={form.values.bufferMin} onChange={(event) => form.set("bufferMin", Number(event.target.value))} />}
          </Field>
        </div>
        
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Timeline colour</legend>
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <button
                key={index}
                type="button"
                className={`relative h-10 w-10 cursor-pointer rounded-full border-2 transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.values.colorIndex === index ? "border-foreground ring-2 ring-foreground/20 ring-offset-2" : "border-transparent"} bg-appointment-${index} border-appointment-${index}-border`}
                aria-label={`Select colour ${index + 1}`}
                onClick={() => form.set("colorIndex", index)}
              >
                {form.values.colorIndex === index ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-foreground" />
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="sticky bottom-0 z-10 mt-auto bg-card pt-4 pb-4">
          <Button type="submit" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save service"}</Button>
        </div>
      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const ResourcesSection = () => {
  const branchesQuery = useQuery({ queryKey: ["branches", "settings"], queryFn: () => api("/branches", z.array(branchSettingsSchema)) })
  const equipmentTypesQuery = useQuery({ queryKey: ["equipment-types"], queryFn: () => api("/equipment-types", z.array(equipmentTypeSchema)) })
  const resourcesQuery = useQuery({ queryKey: ["resources", "settings"], queryFn: () => api("/resources", z.array(resourceSettingsSchema), { query: { includeInactive: "true" } }) })
  
  const client = useQueryClient()
  const [resourceSheet, setResourceSheet] = useState<ResourceSettings | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/resources/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: ["resources", "settings"] })
    toast.success("Resource deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/resources/${id}`, resourceSettingsSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<ResourceSettings[]>(["resources", "settings"], (current = []) =>
      current.map((resource) => (resource.id === saved.id ? saved : resource))
    )
    toast.success("Resource reactivated")
  }

  const isPending = branchesQuery.isPending || equipmentTypesQuery.isPending || resourcesQuery.isPending
  const isError = branchesQuery.isError || equipmentTypesQuery.isError || resourcesQuery.isError || !branchesQuery.data || !equipmentTypesQuery.data || !resourcesQuery.data

  if (isPending) {
    return (
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine.">
        <p className="text-sm text-muted-foreground">Loading resources…</p>
      </Section>
    )
  }

  if (isError) {
    return (
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine.">
        <EmptyState icon={Settings2} title="Could not load resources" hint="Retry shortly." />
      </Section>
    )
  }

  const branches = branchesQuery.data
  const equipmentTypes = equipmentTypesQuery.data
  const resources = resourcesQuery.data

  const chairs = resources.filter((r) => r.type === "chair" && r.isActive)
  const equipment = resources.filter((r) => r.type === "equipment" && r.isActive)
  const inactive = resources.filter((r) => !r.isActive)

  const renderResource = (resource: ResourceSettings) => {
    const branchName = branches.find(b => b.id === resource.branchId)?.name ?? "Unknown branch"
    const typeName = resource.type === "chair" ? "Chair" : equipmentTypes.find((item) => item.id === resource.equipmentTypeId)?.name ?? "Equipment"
    
    return (
      <RecordRow key={resource.id} active={resource.isActive} actions={
        <>
          <Button variant="secondary" onClick={() => setResourceSheet(resource)}>Edit</Button>
          {resource.isActive ? <Button variant="ghost" onClick={() => setDeactivating({ id: resource.id, name: resource.name })}>Deactivate</Button> : <Button variant="secondary" onClick={() => reactivate(resource.id)}>Reactivate</Button>}
        </>
      }>
        <div className="flex items-center gap-3">
          <Badge tone="neutral" className="hidden sm:inline-flex">{branchName}</Badge>
          <div>
            <p className="font-medium text-foreground">{resource.name}</p>
            <p className="text-sm text-muted-foreground sm:hidden">{branchName} · {typeName}</p>
            <p className="hidden text-sm text-muted-foreground sm:block">{typeName}</p>
          </div>
        </div>
      </RecordRow>
    )
  }

  return (
    <>
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine." action={<Button onClick={() => setResourceSheet(null)}>Add resource</Button>}>
        <div className="space-y-6">
          {chairs.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-foreground">Chairs</h3>
              {chairs.map(renderResource)}
            </div>
          ) : null}

          {equipment.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-foreground">Equipment</h3>
              {equipment.map(renderResource)}
            </div>
          ) : null}

          {chairs.length === 0 && equipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active resources.</p>
          ) : null}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-muted-foreground">Inactive resources</h3>
              {inactive.map((resource) => (
                <div key={resource.id} className="opacity-75">{renderResource(resource)}</div>
              ))}
            </div>
          ) : null}
        </div>
      </Section>
      {resourceSheet !== undefined ? <ResourceSheet value={resourceSheet} branches={branches} equipmentTypes={equipmentTypes} onClose={() => setResourceSheet(undefined)} /> : null}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => { if (!open) setDeactivating(null) }} title="Deactivate resource?" description={`Are you sure you want to deactivate "${deactivating?.name}"? Existing booking history stays intact, but no new bookings can use this resource.`} confirmLabel="Deactivate" onConfirm={deactivate} />
    </>
  )
}

const ResourceSheet = ({
  value,
  branches,
  equipmentTypes,
  onClose
}: {
  value: ResourceSettings | null
  branches: BranchSettings[]
  equipmentTypes: Array<{ id: string; name: string }>
  onClose: () => void
}) => {
  const client = useQueryClient()
  const [type, setType] = useState<"chair" | "equipment">(value?.type ?? "chair")
  const form = useAuthForm({
    schema: resourceFormSchema,
    initial: value
      ? { name: value.name, branchId: value.branchId, type: value.type, ...(value.equipmentTypeId ? { equipmentTypeId: value.equipmentTypeId } : {}) }
      : { name: "", branchId: branches[0]?.id ?? "", type: "chair" as const },
    onSubmit: async (values) => {
      const body = value
        ? { name: values.name, branchId: values.branchId, ...(values.equipmentTypeId ? { equipmentTypeId: values.equipmentTypeId } : {}) }
        : values
      const saved = await api(value ? `/resources/${value.id}` : "/resources", resourceSettingsSchema, {
        method: value ? "PATCH" : "POST",
        body
      })
      client.setQueryData<ResourceSettings[]>(["resources", "settings"], (current = []) =>
        value ? current.map((resource) => (resource.id === saved.id ? saved : resource)) : [...current, saved]
      )
      toast.success(value ? "Resource saved" : "Resource added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)
  return (
    <>
    <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit resource" : "Add resource"}>
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="flex h-full flex-col space-y-4">
        <FormError message={form.formError} />
        <Field id="resource-name" label="Resource name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        <Field id="resource-branch" label="Branch" error={form.errors.branchId}>
          {(aria) => <NativeSelect {...aria} name="branchId" value={form.values.branchId} onChange={(event) => form.set("branchId", event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</NativeSelect>}
        </Field>
        {value ? null : (
          <Field id="resource-type" label="Type" error={form.errors.type}>
            {(aria) => (
              <NativeSelect {...aria} name="type" value={type} onChange={(event) => { const next = event.target.value as "chair" | "equipment"; setType(next); form.set("type", next); if (next === "chair") form.set("equipmentTypeId", undefined) }}>
                <option value="chair">Chair</option>
                <option value="equipment">Equipment</option>
              </NativeSelect>
            )}
          </Field>
        )}
        {type === "equipment" ? (
          <Field id="resource-equipment-type" label="Equipment type" error={form.errors.equipmentTypeId}>
            {(aria) => <NativeSelect {...aria} name="equipmentTypeId" value={form.values.equipmentTypeId ?? ""} onChange={(event) => form.set("equipmentTypeId", event.target.value)}><option value="">Choose a type</option>{equipmentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect>}
          </Field>
        ) : null}
        <div className="sticky bottom-0 z-10 mt-auto bg-card pt-4 pb-4">
          <Button type="submit" className="w-full" disabled={form.pending || branches.length === 0} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save resource"}</Button>
        </div>
      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const StaffSection = () => {
  const query = useQuery({ queryKey: ["staff", "settings"], queryFn: () => api("/staff", z.array(staffMemberSchema)) })
  const client = useQueryClient()
  const [staffSheet, setStaffSheet] = useState<StaffMember | null>(null)
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    const saved = await api(`/staff/${deactivating.id}`, staffMemberSchema, { method: "PATCH", body: { isActive: false } })
    client.setQueryData<StaffMember[]>(["staff", "settings"], (current = []) =>
      current.map((member) => (member.id === saved.id ? saved : member))
    )
    toast.success("Staff member deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/staff/${id}`, staffMemberSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<StaffMember[]>(["staff", "settings"], (current = []) =>
      current.map((member) => (member.id === saved.id ? saved : member))
    )
    toast.success("Staff member reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule.">
        <p className="text-sm text-muted-foreground">Loading staff…</p>
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule.">
        <EmptyState icon={Settings2} title="Could not load staff" hint="Retry shortly." />
      </Section>
    )
  }

  const active = query.data.filter((s) => s.isActive)
  const inactive = query.data.filter((s) => !s.isActive)

  const renderStaff = (member: StaffMember) => {
    const canManage = member.role !== "owner"
    return (
      <RecordRow key={member.id} active={member.isActive} actions={
        <>
          <Button variant="secondary" onClick={() => setStaffSheet(member)}>Edit</Button>
          {canManage && member.isActive ? <Button variant="ghost" onClick={() => setDeactivating({ id: member.id, name: member.name })}>Deactivate</Button> : null}
          {canManage && !member.isActive ? <Button variant="secondary" onClick={() => reactivate(member.id)}>Reactivate</Button> : null}
        </>
      }>
        <div className="flex items-center gap-4">
          <InitialsAvatar name={member.name} className="h-10 w-10 text-sm hidden sm:flex" />
          <div>
            <p className="font-medium text-foreground">{member.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className="capitalize font-medium text-foreground">{member.role}</span>
              <span>·</span>
              <span>{member.role === "owner" ? "Full access" : member.role === "receptionist" ? "Can manage bookings" : "Can view schedule"}</span>
            </div>
          </div>
        </div>
      </RecordRow>
    )
  }

  return (
    <>
      <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule." action={<Button onClick={() => setStaffDialogOpen(true)}>Add colleague</Button>}>
        <div className="space-y-6">
          {active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-foreground">Active team</h3>
              {active.map(renderStaff)}
            </div>
          ) : <p className="text-sm text-muted-foreground">No active staff.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 text-sm font-semibold tracking-wide text-muted-foreground">Inactive team</h3>
              {inactive.map((member) => (
                <div key={member.id} className="opacity-75">{renderStaff(member)}</div>
              ))}
            </div>
          ) : null}
        </div>
      </Section>
      {staffSheet ? <StaffSheet value={staffSheet} onClose={() => setStaffSheet(null)} /> : null}
      {staffDialogOpen ? <StaffDialog onClose={() => setStaffDialogOpen(false)} /> : null}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => { if (!open) setDeactivating(null) }} title="Deactivate staff member?" description={`Are you sure you want to deactivate "${deactivating?.name}"? Their account is retained but they can no longer sign in or be scheduled.`} confirmLabel="Deactivate" onConfirm={deactivate} />
    </>
  )
}

const StaffSheet = ({ value, onClose }: { value: StaffMember; onClose: () => void }) => {
  const client = useQueryClient()
  const form = useAuthForm({
    schema: staffFormSchema,
    initial: { name: value.name, role: value.role === "owner" ? "dentist" as const : value.role },
    onSubmit: async (values) => {
      const body = value.role === "owner" ? { name: values.name } : values
      const saved = await api(`/staff/${value.id}`, staffMemberSchema, { method: "PATCH", body })
      client.setQueryData<StaffMember[]>(["staff", "settings"], (current = []) =>
        current.map((member) => (member.id === saved.id ? saved : member))
      )
      toast.success("Staff member saved")
      onClose()
    }
  })
  const editable = value.role !== "owner"
  const discardGuard = useDiscardGuard(form.dirty, onClose)
  return (
    <>
    <Sheet open onOpenChange={discardGuard.requestClose} title="Edit staff member">
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field id="staff-edit-name" label="Name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        {editable ? (
          <Field id="staff-edit-role" label="Role" error={form.errors.role}>
            {(aria) => <NativeSelect {...aria} name="role" value={form.values.role} onChange={(event) => form.set("role", event.target.value as "dentist" | "receptionist")}><option value="dentist">Dentist</option><option value="receptionist">Receptionist</option></NativeSelect>}
          </Field>
        ) : (
          <div className="rounded-md border border-border bg-surface-subtle p-3">
            <p className="text-sm font-medium text-foreground">Owner protection</p>
            <p className="text-sm text-muted-foreground">Owners can update their own name but not their access level, ensuring the clinic never accidentally loses administrative access.</p>
          </div>
        )}
        <div className="sticky bottom-0 z-10 mt-auto bg-card pt-4 pb-4">
          <Button type="submit" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save staff member"}</Button>
        </div>
      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const SettingsContent = () => {
  return (
    <div className="mx-auto max-w-4xl p-4 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-5 lg:mb-0">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
          {sectionItems.map(([id, label, Icon]) => <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="h-4 w-4" aria-hidden="true" />{label}</a>)}
        </nav>
      </aside>
      <main className="space-y-5">
        <header><h1 className="text-xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Keep clinic details, scheduling capacity and team access current.</p></header>
        <ClinicProfileSection />
        <BranchesSection />
        <ServicesSection />
        <ResourcesSection />
        <StaffSection />
      </main>
    </div>
  )
}

export const SettingsPage = () => {
  const session = useSession()
  if (session?.user.role !== "owner") {
    return <div className="mx-auto max-w-2xl p-4"><h1 className="text-xl font-semibold tracking-tight">Settings</h1><EmptyState icon={Settings2} title="Owner access required" hint="Only an owner can change clinic settings." /></div>
  }
  return <SettingsContent />
}
