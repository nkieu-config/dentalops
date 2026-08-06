import {
  branchSettingsSchema,
  clinicProfileSchema,
  createBranchSchema,
  createResourceSchema,
  createServiceSchema,
  equipmentTypeSchema,
  openingHoursSchema,
  resourceSettingsSchema,
  serviceSummarySchema,
  staffMemberSchema,
  updateClinicProfileSchema,
  updateResourceSchema,
  updateServiceSchema,
  updateStaffSchema,
  type BranchSettings,
  type ClinicProfile,
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
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
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

const useSettingsData = () => ({
  profile: useQuery({ queryKey: ["tenant"], queryFn: () => api("/tenant", clinicProfileSchema) }),
  branches: useQuery({
    queryKey: ["branches", "settings"],
    queryFn: () => api("/branches", z.array(branchSettingsSchema))
  }),
  services: useQuery({
    queryKey: ["services", "settings"],
    queryFn: () => api("/services", z.array(serviceSummarySchema))
  }),
  resources: useQuery({
    queryKey: ["resources", "settings"],
    queryFn: () => api("/resources", z.array(resourceSettingsSchema), { query: { includeInactive: "true" } })
  }),
  equipmentTypes: useQuery({
    queryKey: ["equipment-types"],
    queryFn: () => api("/equipment-types", z.array(equipmentTypeSchema))
  }),
  staff: useQuery({
    queryKey: ["staff", "settings"],
    queryFn: () => api("/staff", z.array(staffMemberSchema))
  })
})

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

const ClinicProfileForm = ({ profile }: { profile: ClinicProfile }) => {
  const client = useQueryClient()
  const form = useAuthForm({
    schema: profileFormSchema,
    initial: { name: profile.name, slug: profile.slug },
    fieldForErrorCode: (code) => (code === "SLUG_TAKEN" ? "slug" : null),
    onSubmit: async (values) => {
      const saved = await api("/tenant", clinicProfileSchema, { method: "PATCH", body: values })
      client.setQueryData(["tenant"], saved)
      toast.success("Clinic profile saved")
    }
  })

  return (
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Public booking path: <span className="font-medium text-foreground">/book/{form.values.slug}</span></p>
        <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
          {form.pending ? "Saving…" : "Save clinic"}
        </Button>
      </div>
    </form>
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
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Opening hours</legend>
      {DAYS.map(([day, label]) => {
        const intervals = value[day]
        return (
          <div key={day} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label className="text-sm" htmlFor={`${day}-open-0`}>{label}</Label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => updateDay(day, [...intervals, ["09:00", "17:00"]])}
              >
                Add hours
              </Button>
            </div>
            {intervals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Closed</p>
            ) : (
              <div className="space-y-2">
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
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </fieldset>
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
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} title={value ? "Edit branch" : "Add branch"}>
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field id="branch-name" label="Branch name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        <Field id="branch-timezone" label="Timezone" error={form.errors.timezone}>
          {(aria) => <FieldInput {...aria} name="timezone" value={form.values.timezone} onChange={(event) => form.set("timezone", event.target.value)} />}
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
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} title={value ? "Edit service" : "Add service"}>
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
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
        <Field id="service-colour" label="Timeline colour" error={form.errors.colorIndex}>
          {(aria) => (
            <NativeSelect {...aria} name="colorIndex" value={form.values.colorIndex} onChange={(event) => form.set("colorIndex", Number(event.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((index) => <option key={index} value={index}>Colour {index + 1}</option>)}
            </NativeSelect>
          )}
        </Field>
        <Button type="submit" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save service"}</Button>
      </form>
    </Sheet>
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
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} title={value ? "Edit resource" : "Add resource"}>
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
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
        <Button type="submit" className="w-full" disabled={form.pending || branches.length === 0} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save resource"}</Button>
      </form>
    </Sheet>
  )
}

const StaffSheet = ({ value, onClose }: { value: StaffMember; onClose: () => void }) => {
  const client = useQueryClient()
  const form = useAuthForm({
    schema: staffFormSchema,
    initial: { name: value.name, role: value.role === "owner" ? "dentist" as const : value.role, isActive: value.isActive },
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
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }} title="Edit staff member">
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-4">
        <FormError message={form.formError} />
        <Field id="staff-edit-name" label="Name" error={form.errors.name}>
          {(aria) => <FieldInput {...aria} name="name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />}
        </Field>
        {editable ? (
          <>
            <Field id="staff-edit-role" label="Role" error={form.errors.role}>
              {(aria) => <NativeSelect {...aria} name="role" value={form.values.role} onChange={(event) => form.set("role", event.target.value as "dentist" | "receptionist")}><option value="dentist">Dentist</option><option value="receptionist">Receptionist</option></NativeSelect>}
            </Field>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm font-medium">
              <input type="checkbox" checked={form.values.isActive} onChange={(event) => form.set("isActive", event.target.checked)} />
              Active and able to sign in
            </label>
          </>
        ) : <p className="text-sm text-muted-foreground">Owners can update their own name but not their access level.</p>}
        <Button type="submit" className="w-full" disabled={form.pending} aria-busy={form.pending}>{form.pending ? "Saving…" : "Save staff member"}</Button>
      </form>
    </Sheet>
  )
}

const SettingsContent = () => {
  const data = useSettingsData()
  const client = useQueryClient()
  const [branchSheet, setBranchSheet] = useState<BranchSettings | null | undefined>(undefined)
  const [serviceSheet, setServiceSheet] = useState<ServiceSummary | null | undefined>(undefined)
  const [resourceSheet, setResourceSheet] = useState<ResourceSettings | null | undefined>(undefined)
  const [staffSheet, setStaffSheet] = useState<StaffMember | null>(null)
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)

  if (Object.values(data).some((query) => query.isPending)) {
    return <div className="mx-auto max-w-4xl p-4"><p className="text-sm text-muted-foreground">Loading settings…</p></div>
  }
  if (Object.values(data).some((query) => query.isError) || !data.profile.data || !data.branches.data || !data.services.data || !data.resources.data || !data.equipmentTypes.data || !data.staff.data) {
    return <EmptyState icon={Settings2} title="Could not load settings" hint="Retry shortly." />
  }

  const equipmentTypes = data.equipmentTypes.data

  const deactivate = async (path: string, key: string, message: string) => {
    if (!window.confirm(`Deactivate this ${key}? Existing booking history stays intact.`)) return
    await api(path, z.unknown(), { method: "DELETE" })
    await client.invalidateQueries({ queryKey: [key, "settings"] })
    toast.success(message)
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-5 lg:mb-0">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
          {sectionItems.map(([id, label, Icon]) => <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="h-4 w-4" aria-hidden="true" />{label}</a>)}
        </nav>
      </aside>
      <main className="space-y-5">
        <header><h1 className="text-xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Keep clinic details, scheduling capacity and team access current.</p></header>
        <Section id="clinic" title="Clinic profile" description="The name and URL patients see when they book."><ClinicProfileForm key={`${data.profile.data.name}-${data.profile.data.slug}`} profile={data.profile.data} /></Section>
        <Section id="branches" title="Branches" description="Opening hours control when each location can accept bookings." action={<Button onClick={() => setBranchSheet(null)}>Add branch</Button>}>
          <div className="space-y-2">{data.branches.data.map((branch) => <RecordRow key={branch.id} active={branch.isActive} actions={<><Button variant="secondary" onClick={() => setBranchSheet(branch)}>Edit</Button><Button variant="ghost" onClick={() => void deactivate(`/branches/${branch.id}`, "branches", "Branch deactivated")}>Deactivate</Button></>}><p className="font-medium">{branch.name}</p><p className="text-sm text-muted-foreground">{branch.timezone}</p></RecordRow>)}</div>
        </Section>
        <Section id="services" title="Services" description="Duration and buffer time keep the schedule realistic." action={<Button onClick={() => setServiceSheet(null)}>Add service</Button>}>
          <div className="space-y-2">{data.services.data.map((service) => <RecordRow key={service.id} active={service.isActive} actions={<><Button variant="secondary" onClick={() => setServiceSheet(service)}>Edit</Button>{service.isActive ? <Button variant="ghost" onClick={() => void deactivate(`/services/${service.id}`, "services", "Service deactivated")}>Deactivate</Button> : null}</>}><p className="font-medium">{service.name}</p><p className="text-sm tabular-nums text-muted-foreground">{service.durationMin} min + {service.bufferMin} min buffer</p></RecordRow>)}</div>
        </Section>
        <Section id="resources" title="Resources" description="Chairs and equipment available to your scheduling engine." action={<Button onClick={() => setResourceSheet(null)}>Add resource</Button>}>
          <div className="space-y-2">{data.resources.data.map((resource) => <RecordRow key={resource.id} active={resource.isActive} actions={<><Button variant="secondary" onClick={() => setResourceSheet(resource)}>Edit</Button>{resource.isActive ? <Button variant="ghost" onClick={() => void deactivate(`/resources/${resource.id}`, "resources", "Resource deactivated")}>Deactivate</Button> : null}</>}><p className="font-medium">{resource.name}</p><p className="text-sm text-muted-foreground">{resource.type === "chair" ? "Chair" : equipmentTypes.find((item) => item.id === resource.equipmentTypeId)?.name ?? "Equipment"}</p></RecordRow>)}</div>
        </Section>
        <Section id="staff" title="Staff" description="Manage who can book appointments and work from the schedule." action={<Button onClick={() => setStaffDialogOpen(true)}>Add colleague</Button>}>
          <div className="space-y-2">{data.staff.data.map((member) => <RecordRow key={member.id} active={member.isActive} actions={<Button variant="secondary" onClick={() => setStaffSheet(member)}>Edit</Button>}><p className="font-medium">{member.name}</p><p className="capitalize text-sm text-muted-foreground">{member.role}</p></RecordRow>)}</div>
        </Section>
      </main>
      {branchSheet !== undefined ? <BranchSheet value={branchSheet} onClose={() => setBranchSheet(undefined)} /> : null}
      {serviceSheet !== undefined ? <ServiceSheet value={serviceSheet} onClose={() => setServiceSheet(undefined)} /> : null}
      {resourceSheet !== undefined ? <ResourceSheet value={resourceSheet} branches={data.branches.data} equipmentTypes={equipmentTypes} onClose={() => setResourceSheet(undefined)} /> : null}
      {staffSheet ? <StaffSheet value={staffSheet} onClose={() => setStaffSheet(null)} /> : null}
      {staffDialogOpen ? <StaffDialog onClose={() => setStaffDialogOpen(false)} /> : null}
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
