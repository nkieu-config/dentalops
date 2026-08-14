import {
  branchSettingsSchema,
  clinicProfileSchema,
  type ClinicProfile,
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
import { MapPin, Settings2, TriangleAlert } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "../../components/ui/badge"
import { Button, buttonVariants } from "../../components/ui/button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Input } from "../../components/ui/input"
import { Skeleton } from "../../components/ui/skeleton"
import { PageHeader } from "../../components/ui/page-header"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { useDiscardGuard } from "../../lib/use-discard-guard"
import { AppSelect } from "../../components/ui/app-select"
import { Sheet } from "../../components/ui/sheet"
import { api } from "../../lib/api"
import { useSession } from "../../lib/session"
import { Checkbox } from "../../components/ui/checkbox"
import { Field, FieldInput, FormError } from "../../components/ui/form-field"
import { useAuthForm } from "../auth/use-auth-form"
import { StaffDialog } from "../staff/staff-dialog"
import { appointmentHue } from "../../lib/appointment-hue"
import { queryKeys } from "../../lib/query-keys"

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

const serviceColourNames = ["Teal", "Blue", "Violet", "Rose", "Amber", "Sage"]



const Section = ({
  id,
  title,
  description,
  action,
  children
}: {
  id: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section id={id} className="scroll-mt-20">
    <Card>
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  </section>
)

const SectionSkeleton = ({ label, rows = 3 }: { label: string; rows?: number }) => (
  <div aria-busy="true" aria-label={`Loading ${label}`} className="space-y-2">
    {Array.from({ length: rows }, (_, index) => (
      <div
        key={index}
        data-testid="section-row-skeleton"
        className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>
    ))}
  </div>
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
      {active ? null : <StateBadge active={false} />}
      {actions}
    </div>
  </div>
)

const ClinicProfileSection = () => {
  const query = useQuery({ queryKey: queryKeys.tenant(), queryFn: () => api("/tenant", clinicProfileSchema) })

  if (query.isPending) {
    return (
      <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
        <SectionSkeleton label="clinic profile" rows={2} />
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
        <EmptyState icon={TriangleAlert} title="Could not load clinic profile" hint="Check your connection and try again." action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button>} />
      </Section>
    )
  }

  return <ClinicProfileForm profile={query.data} />
}

const ClinicProfileForm = ({ profile }: { profile: ClinicProfile }) => {
  const client = useQueryClient()
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle")

  const form = useAuthForm({
    schema: profileFormSchema,
    initial: { name: profile.name, slug: profile.slug },
    fieldForErrorCode: (code) => (code === "SLUG_TAKEN" ? "slug" : null),
    onSubmit: async (values) => {
      const saved = await api("/tenant", clinicProfileSchema, { method: "PATCH", body: values })
      client.setQueryData(queryKeys.tenant(), saved)
      toast.success("Clinic profile saved")
    }
  })

  const publicUrl = `${window.location.origin}${profile.publicBookingPath}`
  const bookingLinkDirty = form.values.slug !== profile.slug

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopyStatus("success")
      toast.success("Copied link")
    } catch {
      setCopyStatus("error")
      toast.error("Could not copy link. Select and copy it manually.")
    }
  }

  return (
    <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book.">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <form ref={form.formRef} onSubmit={form.submit} noValidate className="min-w-0 space-y-4">
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
            <p className="mb-2 type-ui font-medium text-foreground">Public booking link</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 type-ui text-muted-foreground" title={publicUrl}>{publicUrl}</code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={bookingLinkDirty}
                onClick={() => void copyPublicUrl()}
              >
                Copy
              </Button>
              <a
                href={profile.publicBookingPath}
                target="_blank"
                rel="noreferrer"
                aria-disabled={bookingLinkDirty}
                onClick={bookingLinkDirty ? (event) => event.preventDefault() : undefined}
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: bookingLinkDirty ? "pointer-events-none opacity-50" : undefined
                })}
              >
                Open
              </a>
            </div>
            {bookingLinkDirty ? <p role="status" className="mt-2 type-ui text-muted-foreground">Save changes to publish this link.</p> : null}
            {copyStatus === "error" ? <p role="alert" className="mt-2 type-ui font-medium text-destructive">Could not copy link. Select and copy it manually.</p> : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={form.pending || !form.dirty} aria-busy={form.pending}>
              {form.pending ? "Saving…" : "Save clinic"}
            </Button>
          </div>
        </form>

        <div className="hidden xl:block">
          <p className="mb-3 type-ui font-medium text-foreground">Patient preview</p>
          <div className="rounded-2xl bg-surface-subtle p-1">
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
              <div className="h-24 bg-primary/10"></div>
              <div className="px-5 pb-6 pt-5">
                <div className="mb-4 h-12 w-12 rounded-xl bg-primary shadow-xs"></div>
                <p className="mb-1 type-subsection-title font-semibold text-foreground line-clamp-1">{form.values.name || "Clinic Name"}</p>
                <p className="type-ui text-muted-foreground">Book an appointment online</p>
              </div>
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
  const [expandedDay, setExpandedDay] = useState<Day | null>(null)
  const [dayToCopy, setDayToCopy] = useState<Day | null>(null)
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

  const summaryFor = (intervals: Array<[string, string]>) =>
    intervals.length === 0 ? "Closed" : intervals.map(([start, end]) => `${start}–${end}`).join(" · ")

  const copiedDayLabel = dayToCopy ? DAYS.find(([day]) => day === dayToCopy)?.[1] : ""

  return (
    <>
      <fieldset className="space-y-3">
        <legend className="type-ui font-medium">Opening hours</legend>
      <div className="space-y-3">
        {DAYS.map(([day, label]) => {
          const intervals = value[day]
          const isOpen = intervals.length > 0
          const expanded = expandedDay === day
          
          return (
            <div key={day} className="overflow-hidden rounded-md border border-border bg-card">
              <button
                type="button"
                aria-label={`Edit ${label} hours`}
                aria-expanded={expanded}
                aria-controls={`${day}-hours-panel`}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => setExpandedDay(expanded ? null : day)}
              >
                <span className="type-ui font-medium text-foreground">{label}</span>
                <span className="min-w-0 truncate type-ui tabular-nums text-muted-foreground">{summaryFor(intervals)}</span>
              </button>
              {expanded ? (
                <div id={`${day}-hours-panel`} className="space-y-3 border-t border-border bg-surface-subtle p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 type-ui font-medium">
                      <Checkbox
                        checked={isOpen}
                        onChange={(event) => updateDay(day, event.target.checked ? [["09:00", "17:00"]] : [])}
                      />
                      Open {label}
                    </label>
                    {isOpen ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDayToCopy(day)}>
                        Apply {label} hours to weekdays
                      </Button>
                    ) : null}
                  </div>
                  {!isOpen ? <p className="type-ui text-muted-foreground">Closed</p> : (
                    <div className="space-y-3">
                  {intervals.map(([start, end], index) => (
                    <div key={`${day}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Input
                        id={`${day}-open-${index}`}
                        type="time"
                        className="tabular-nums"
                        aria-label={`${label} opening ${index + 1} starts`}
                        value={start}
                        onChange={(event) => {
                          const next = intervals.map((interval, intervalIndex) =>
                            intervalIndex === index ? [event.target.value, interval[1]] as [string, string] : interval
                          )
                          updateDay(day, next)
                        }}
                      />
                      <span className="type-ui text-muted-foreground">to</span>
                      <Input
                        type="time"
                        className="tabular-nums"
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
                        className="col-span-3 justify-self-end"
                        aria-label={`Remove ${label} hours ${index + 1}`}
                        onClick={() => updateDay(day, intervals.filter((_, intervalIndex) => intervalIndex !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                      <Button type="button" size="sm" variant="secondary" onClick={() => updateDay(day, [...intervals, ["09:00", "17:00"]])}>Add hours</Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? <p role="alert" className="type-ui font-medium text-destructive">{error}</p> : null}
      </fieldset>
      <AlertDialog
        open={dayToCopy !== null}
        onOpenChange={(open) => { if (!open) setDayToCopy(null) }}
        title={`Apply ${copiedDayLabel} hours to weekdays?`}
        description={`This replaces the current Monday–Friday hours with ${copiedDayLabel}'s schedule.`}
        confirmLabel="Apply hours"
        onConfirm={() => {
          if (dayToCopy) copyToWeekdays(dayToCopy)
          setDayToCopy(null)
        }}
      />
    </>
  )
}

const BranchesSection = () => {
  const query = useQuery({ queryKey: queryKeys.branches(), queryFn: () => api("/branches", z.array(branchSettingsSchema)) })
  const client = useQueryClient()
  const [branchSheet, setBranchSheet] = useState<BranchSettings | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/branches/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: queryKeys.branches() })
    toast.success("Branch deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/branches/${id}`, branchSettingsSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<BranchSettings[]>(queryKeys.branches(), (current = []) =>
      current.map((branch) => (branch.id === saved.id ? saved : branch))
    )
    toast.success("Branch reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings.">
        <SectionSkeleton label="branches" />
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings.">
        <EmptyState icon={TriangleAlert} title="Could not load branches" hint="Check your connection and try again." action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button>} />
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
              <h3 className="px-1 type-ui font-semibold tracking-wide text-foreground">Locations</h3>
              {active.map((branch) => (
                <RecordRow key={branch.id} active={branch.isActive} actions={<><Button variant="secondary" aria-label={`Edit ${branch.name}`} onClick={() => setBranchSheet(branch)}>Edit</Button><Button variant="ghost" aria-label={`Deactivate ${branch.name}`} onClick={() => setDeactivating({ id: branch.id, name: branch.name })}>Deactivate</Button></>}>
                  <p className="font-medium">{branch.name}</p>
                  <p className="type-ui text-muted-foreground">{branch.timezone}</p>
                </RecordRow>
              ))}
            </div>
          ) : <p className="type-ui text-muted-foreground">No active branches.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-muted-foreground">Inactive locations</h3>
              {inactive.map((branch) => (
                <div key={branch.id}>
                  <RecordRow active={branch.isActive} actions={<><Button variant="secondary" aria-label={`Edit ${branch.name}`} onClick={() => setBranchSheet(branch)}>Edit</Button><Button variant="secondary" aria-label={`Reactivate ${branch.name}`} onClick={() => reactivate(branch.id)}>Reactivate</Button></>}>
                    <p className="font-medium">{branch.name}</p>
                    <p className="type-ui text-muted-foreground">{branch.timezone}</p>
                  </RecordRow>
                </div>
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
      client.setQueryData<BranchSettings[]>(queryKeys.branches(), (current = []) =>
        value ? current.map((branch) => (branch.id === saved.id ? saved : branch)) : [...current, saved]
      )
      toast.success(value ? "Branch saved" : "Branch added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)
  return (
    <>
      <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit branch" : "Add branch"} footer={<Button type="submit" form="branch-form" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save branch"}</Button>}>
        <form id="branch-form" ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
          <FormError message={form.formError} />
          <Field id="branch-name" label="Branch name" error={form.errors.name}>
            {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
          </Field>
          <Field id="branch-timezone" label="Timezone" error={form.errors.timezone}>
            {(aria) => (
              <div>
                <FieldInput {...aria} name="timezone" value={form.values.timezone} onChange={(event) => form.set("timezone", event.target.value)} disabled={true} />
                <p className="mt-2 type-ui text-muted-foreground">Note: Currently locked to <span className="font-medium text-foreground">Asia/Bangkok</span> for all branches.</p>
              </div>
            )}
          </Field>
          <OpeningHoursEditor
            value={form.values.openingHours}
            onChange={(openingHours) => form.set("openingHours", openingHours)}
            error={form.errors.openingHours}
          />
        </form>
      </Sheet>
      {discardGuard.dialog}
    </>
  )
}

const ServicesSection = () => {
  const query = useQuery({ queryKey: queryKeys.services(), queryFn: () => api("/services", z.array(serviceSummarySchema)) })
  const client = useQueryClient()
  const [serviceSheet, setServiceSheet] = useState<ServiceSummary | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/services/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: queryKeys.services() })
    toast.success("Service deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/services/${id}`, serviceSummarySchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<ServiceSummary[]>(queryKeys.services(), (current = []) =>
      current.map((service) => (service.id === saved.id ? saved : service))
    )
    toast.success("Service reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic.">
        <SectionSkeleton label="services" />
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic.">
        <EmptyState icon={TriangleAlert} title="Could not load services" hint="Check your connection and try again." action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button>} />
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
              <h3 className="px-1 type-ui font-semibold tracking-wide text-foreground">Services</h3>
              {active.map((service) => (
                <RecordRow key={service.id} active={service.isActive} actions={<><Button variant="secondary" aria-label={`Edit ${service.name}`} onClick={() => setServiceSheet(service)}>Edit</Button><Button variant="ghost" aria-label={`Deactivate ${service.name}`} onClick={() => setDeactivating({ id: service.id, name: service.name })}>Deactivate</Button></>}>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full border"
                      style={{
                        backgroundColor: appointmentHue(service.colorIndex).background,
                        borderColor: appointmentHue(service.colorIndex).border
                      }}
                    />
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="type-ui tabular-nums text-muted-foreground">{service.durationMin} min + {service.bufferMin} min buffer</p>
                    </div>
                  </div>
                </RecordRow>
              ))}
            </div>
          ) : <p className="type-ui text-muted-foreground">No active services.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-muted-foreground">Inactive services</h3>
              {inactive.map((service) => (
                <div key={service.id}>
                  <RecordRow active={service.isActive} actions={<><Button variant="secondary" aria-label={`Edit ${service.name}`} onClick={() => setServiceSheet(service)}>Edit</Button><Button variant="secondary" aria-label={`Reactivate ${service.name}`} onClick={() => reactivate(service.id)}>Reactivate</Button></>}>
                    <div className="flex items-center gap-3">
                      <div
                      className="h-4 w-4 rounded-full border"
                      style={{
                        backgroundColor: appointmentHue(service.colorIndex).background,
                        borderColor: appointmentHue(service.colorIndex).border
                      }}
                    />
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="type-ui tabular-nums text-muted-foreground">{service.durationMin} min + {service.bufferMin} min buffer</p>
                      </div>
                    </div>
                  </RecordRow>
                </div>
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
      client.setQueryData<ServiceSummary[]>(queryKeys.services(), (current = []) =>
        value ? current.map((service) => (service.id === saved.id ? saved : service)) : [...current, saved]
      )
      toast.success(value ? "Service saved" : "Service added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)

  return (
    <>
    <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit service" : "Add service"} footer={<Button type="submit" form="service-form" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save service"}</Button>}>
      <form id="service-form" ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <p className="mb-2 type-meta font-semibold uppercase tracking-wider text-muted-foreground">Timeline preview</p>
          <div
            className="relative flex h-20 flex-col rounded-md border p-3 shadow-xs transition-colors"
            style={{
              backgroundColor: appointmentHue(form.values.colorIndex).background,
              borderColor: appointmentHue(form.values.colorIndex).border
            }}
          >
            <div
              className="absolute left-0 top-0 h-full w-1 rounded-l-md"
              style={{ backgroundColor: appointmentHue(form.values.colorIndex).border }}
            />
            <p className="font-semibold text-card-foreground">{form.values.name || "Service Name"}</p>
            <p className="type-ui font-medium text-appointment-muted">{form.values.durationMin + form.values.bufferMin} min total slot</p>
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
          <legend className="type-ui font-medium">Timeline colour</legend>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Service color">
            {serviceColourNames.map((colour, index) => (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={form.values.colorIndex === index}
                tabIndex={form.values.colorIndex === index ? 0 : -1}
                className={`relative h-10 w-10 cursor-pointer rounded-full border-2 transition-[border-color,box-shadow,transform] duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.values.colorIndex === index ? "border-foreground ring-2 ring-foreground/20 ring-offset-2" : "border-transparent"}`}
                style={{ backgroundColor: appointmentHue(index).background }}
                aria-label={`Select ${colour} timeline colour`}
                onClick={() => form.set("colorIndex", index)}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
                  if (offset === 0) return
                  event.preventDefault()
                  const nextIndex = (index + offset + serviceColourNames.length) % serviceColourNames.length
                  form.set("colorIndex", nextIndex)
                  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                  radios?.[nextIndex]?.focus()
                }}
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

      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const ResourcesSection = () => {
  const branchesQuery = useQuery({ queryKey: queryKeys.branches(), queryFn: () => api("/branches", z.array(branchSettingsSchema)) })
  const equipmentTypesQuery = useQuery({ queryKey: queryKeys.equipmentTypes(), queryFn: () => api("/equipment-types", z.array(equipmentTypeSchema)) })
  const resourcesQuery = useQuery({ queryKey: queryKeys.resources.includingInactive(), queryFn: () => api("/resources", z.array(resourceSettingsSchema), { query: { includeInactive: "true" } }) })
  
  const client = useQueryClient()
  const [resourceSheet, setResourceSheet] = useState<ResourceSettings | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    await api(`/resources/${deactivating.id}`, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: queryKeys.resources.includingInactive() })
    toast.success("Resource deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/resources/${id}`, resourceSettingsSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<ResourceSettings[]>(queryKeys.resources.includingInactive(), (current = []) =>
      current.map((resource) => (resource.id === saved.id ? saved : resource))
    )
    toast.success("Resource reactivated")
  }

  const isPending = branchesQuery.isPending || equipmentTypesQuery.isPending || resourcesQuery.isPending
  const isError = branchesQuery.isError || equipmentTypesQuery.isError || resourcesQuery.isError || !branchesQuery.data || !equipmentTypesQuery.data || !resourcesQuery.data

  if (isPending) {
    return (
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine.">
        <SectionSkeleton label="resources" />
      </Section>
    )
  }

  if (isError) {
    return (
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine.">
        <EmptyState icon={TriangleAlert} title="Could not load resources" hint="Check your connection and try again." action={<Button variant="secondary" onClick={() => void Promise.all([branchesQuery.refetch(), equipmentTypesQuery.refetch(), resourcesQuery.refetch()])}>Retry</Button>} />
      </Section>
    )
  }

  const branches = branchesQuery.data
  const equipmentTypes = equipmentTypesQuery.data
  const resources = resourcesQuery.data

  const chairs = resources.filter((r) => r.type === "chair" && r.isActive)
  const equipment = resources.filter((r) => r.type === "equipment" && r.isActive)
  const inactive = resources.filter((r) => !r.isActive)
  const navigateToBranches = () => {
    window.history.replaceState(null, "", "#branches")
    document.getElementById("branches")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const addBranchAction = <Button variant="secondary" onClick={navigateToBranches}>Add branch</Button>

  const renderResource = (resource: ResourceSettings) => {
    const branchName = branches.find(b => b.id === resource.branchId)?.name ?? "Unknown branch"
    const typeName = resource.type === "chair" ? "Chair" : equipmentTypes.find((item) => item.id === resource.equipmentTypeId)?.name ?? "Equipment"
    
    return (
      <RecordRow key={resource.id} active={resource.isActive} actions={
        <>
          <Button variant="secondary" aria-label={`Edit ${resource.name}`} onClick={() => setResourceSheet(resource)}>Edit</Button>
          {resource.isActive ? <Button variant="ghost" aria-label={`Deactivate ${resource.name}`} onClick={() => setDeactivating({ id: resource.id, name: resource.name })}>Deactivate</Button> : <Button variant="secondary" aria-label={`Reactivate ${resource.name}`} onClick={() => reactivate(resource.id)}>Reactivate</Button>}
        </>
      }>
        <div className="flex items-center gap-3">
          <Badge tone="neutral" className="hidden sm:inline-flex">{branchName}</Badge>
          <div>
            <p className="font-medium text-foreground">{resource.name}</p>
            <p className="type-ui text-muted-foreground sm:hidden">{branchName} · {typeName}</p>
            <p className="hidden type-ui text-muted-foreground sm:block">{typeName}</p>
          </div>
        </div>
      </RecordRow>
    )
  }

  return (
    <>
      <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine." action={branches.length === 0 ? undefined : <Button onClick={() => setResourceSheet(null)}>Add resource</Button>}>
        <div className="space-y-6">
          {chairs.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-foreground">Chairs</h3>
              {chairs.map(renderResource)}
            </div>
          ) : null}

          {equipment.length > 0 ? (
            <div className="space-y-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-foreground">Equipment</h3>
              {equipment.map(renderResource)}
            </div>
          ) : null}

          {chairs.length === 0 && equipment.length === 0 ? (
            branches.length === 0 ? <EmptyState icon={MapPin} title="Add a branch before resources" hint="Resources need a location before they can be scheduled." action={addBranchAction} /> : <p className="type-ui text-muted-foreground">No active resources.</p>
          ) : null}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-muted-foreground">Inactive resources</h3>
              {inactive.map((resource) => (
                <div key={resource.id}>{renderResource(resource)}</div>
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
      client.setQueryData<ResourceSettings[]>(queryKeys.resources.includingInactive(), (current = []) =>
        value ? current.map((resource) => (resource.id === saved.id ? saved : resource)) : [...current, saved]
      )
      toast.success(value ? "Resource saved" : "Resource added")
      onClose()
    }
  })
  const discardGuard = useDiscardGuard(form.dirty, onClose)
  return (
    <>
    <Sheet open onOpenChange={discardGuard.requestClose} title={value ? "Edit resource" : "Add resource"} footer={<Button type="submit" form="resource-form" className="w-full" disabled={form.pending || branches.length === 0} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save resource"}</Button>}>
      <form id="resource-form" ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field id="resource-name" label="Resource name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        <Field id="resource-branch" label="Branch" error={form.errors.branchId}>
          {(aria) => <AppSelect {...aria} name="branchId" aria-label="Branch" value={form.values.branchId} onValueChange={(branchId) => form.set("branchId", branchId)} options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} />}
        </Field>
        {value ? null : (
          <Field id="resource-type" label="Type" error={form.errors.type}>
            {(aria) => (
              <AppSelect {...aria} name="type" aria-label="Type" value={type} onValueChange={(next) => { const resourceType = next as "chair" | "equipment"; setType(resourceType); form.set("type", resourceType); if (resourceType === "chair") form.set("equipmentTypeId", undefined) }} options={[{ value: "chair", label: "Chair" }, { value: "equipment", label: "Equipment" }]} />
            )}
          </Field>
        )}
        {type === "equipment" ? (
          <Field id="resource-equipment-type" label="Equipment type" error={form.errors.equipmentTypeId}>
            {(aria) => <AppSelect {...aria} name="equipmentTypeId" aria-label="Equipment type" value={form.values.equipmentTypeId ?? ""} placeholder="Choose a type" onValueChange={(equipmentTypeId) => form.set("equipmentTypeId", equipmentTypeId)} options={equipmentTypes.map((item) => ({ value: item.id, label: item.name }))} />}
          </Field>
        ) : null}
        {branches.length === 0 ? (
          <p className="type-ui text-muted-foreground">Add a branch before you can create resources.</p>
        ) : null}
      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const StaffSection = () => {
  const query = useQuery({ queryKey: queryKeys.staff.all(), queryFn: () => api("/staff", z.array(staffMemberSchema)) })
  const client = useQueryClient()
  const [staffSheet, setStaffSheet] = useState<StaffMember | null>(null)
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)

  const deactivate = async () => {
    if (!deactivating) return
    const saved = await api(`/staff/${deactivating.id}`, staffMemberSchema, { method: "PATCH", body: { isActive: false } })
    client.setQueryData<StaffMember[]>(queryKeys.staff.all(), (current = []) =>
      current.map((member) => (member.id === saved.id ? saved : member))
    )
    toast.success("Staff member deactivated")
    setDeactivating(null)
  }

  const reactivate = async (id: string) => {
    const saved = await api(`/staff/${id}`, staffMemberSchema, { method: "PATCH", body: { isActive: true } })
    client.setQueryData<StaffMember[]>(queryKeys.staff.all(), (current = []) =>
      current.map((member) => (member.id === saved.id ? saved : member))
    )
    toast.success("Staff member reactivated")
  }

  if (query.isPending) {
    return (
      <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule.">
        <SectionSkeleton label="staff" />
      </Section>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule.">
        <EmptyState icon={TriangleAlert} title="Could not load staff" hint="Check your connection and try again." action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry</Button>} />
      </Section>
    )
  }

  const active = query.data.filter((s) => s.isActive)
  const inactive = query.data.filter((s) => !s.isActive)
  const activeOwnerCount = query.data.filter((s) => s.role === "owner" && s.isActive).length

  const renderStaff = (member: StaffMember) => {
    const isLastOwner = member.role === "owner" && activeOwnerCount <= 1
    return (
      <RecordRow key={member.id} active={member.isActive} actions={
        <>
          <Button variant="secondary" aria-label={`Edit ${member.name}`} onClick={() => setStaffSheet(member)}>Edit</Button>
          {member.isActive && !isLastOwner ? <Button variant="ghost" aria-label={`Deactivate ${member.name}`} onClick={() => setDeactivating({ id: member.id, name: member.name })}>Deactivate</Button> : null}
          {!member.isActive ? <Button variant="secondary" aria-label={`Reactivate ${member.name}`} onClick={() => reactivate(member.id)}>Reactivate</Button> : null}
          {member.isActive && isLastOwner ? <p className="type-ui text-muted-foreground">The last owner can't be deactivated.</p> : null}
        </>
      }>
        <div className="flex items-center gap-4">
          <InitialsAvatar name={member.name} className="h-10 w-10 type-ui hidden sm:flex" />
          <div>
            <p className="font-medium text-foreground">{member.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 type-ui text-muted-foreground">
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
              <h3 className="px-1 type-ui font-semibold tracking-wide text-foreground">Team</h3>
              {active.map(renderStaff)}
            </div>
          ) : <p className="type-ui text-muted-foreground">No active staff.</p>}

          {inactive.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h3 className="px-1 type-ui font-semibold tracking-wide text-muted-foreground">Inactive team</h3>
              {inactive.map((member) => (
                <div key={member.id}>{renderStaff(member)}</div>
              ))}
            </div>
          ) : null}
        </div>
      </Section>
      {staffSheet ? <StaffSheet value={staffSheet} onClose={() => setStaffSheet(null)} /> : null}
      {staffDialogOpen ? <StaffDialog onClose={() => setStaffDialogOpen(false)} /> : null}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => { if (!open) setDeactivating(null) }} title="Deactivate staff member?" description={`Are you sure you want to deactivate "${deactivating?.name}"? Existing bookings assigned to them stay as-is, but they can no longer sign in or be scheduled for new appointments.`} confirmLabel="Deactivate" onConfirm={deactivate} />
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
      client.setQueryData<StaffMember[]>(queryKeys.staff.all(), (current = []) =>
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
    <Sheet open onOpenChange={discardGuard.requestClose} title="Edit staff member" footer={<Button type="submit" form="staff-form" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save staff member"}</Button>}>
      <form id="staff-form" ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field id="staff-edit-name" label="Name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        {editable ? (
          <Field id="staff-edit-role" label="Role" error={form.errors.role}>
            {(aria) => <AppSelect {...aria} name="role" aria-label="Role" value={form.values.role} onValueChange={(role) => form.set("role", role as "dentist" | "receptionist")} options={[{ value: "dentist", label: "Dentist" }, { value: "receptionist", label: "Receptionist" }]} />}
          </Field>
        ) : (
          <div className="rounded-md border border-border bg-surface-subtle p-3">
            <p className="type-ui font-medium text-foreground">Owner protection</p>
            <p className="type-ui text-muted-foreground">Owners can update their own name but not their access level, ensuring the clinic never accidentally loses administrative access.</p>
          </div>
        )}
      </form>
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}

const SettingsShell = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col p-2 sm:p-3">
    <section
      data-testid="settings-command-surface"
      className="mx-auto w-full max-w-4xl rounded-hero border border-border bg-card p-4 shadow-xs sm:p-5"
    >
      <PageHeader title="Settings" description="Clinic profile, locations, services, chairs and team." />
    </section>
    <div className="mx-auto w-full max-w-4xl space-y-5 pt-4">{children}</div>
  </div>
)

const SettingsContent = () => (
  <SettingsShell>
    <ClinicProfileSection />
    <BranchesSection />
    <ServicesSection />
    <ResourcesSection />
    <StaffSection />
  </SettingsShell>
)

export const SettingsPage = () => {
  const session = useSession()
  if (session?.user.role !== "owner") {
    return (
      <SettingsShell>
        <EmptyState icon={Settings2} title="Owner access required" hint="Only an owner can change clinic settings." />
      </SettingsShell>
    )
  }
  return <SettingsContent />
}
