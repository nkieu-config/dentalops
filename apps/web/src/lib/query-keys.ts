export const queryKeys = {
  tenant: () => ["tenant"] as const,

  branches: () => ["branches"] as const,
  services: () => ["services"] as const,
  equipmentTypes: () => ["equipment-types"] as const,

  staff: {
    root: () => ["staff"] as const,
    all: () => ["staff", "all"] as const,
    byRole: (role: string) => ["staff", "role", role] as const
  },

  resources: {
    chairs: (branchId: string | undefined) => ["resources", "chair", branchId] as const,
    includingInactive: () => ["resources", "all"] as const
  },

  shifts: {
    root: () => ["shifts"] as const,
    day: (branchId: string | undefined, dayStart: number) =>
      ["shifts", "day", branchId, dayStart] as const,
    week: (branchId: string | undefined, weekStart: string) =>
      ["shifts", "week", branchId, weekStart] as const
  },

  appointments: {
    root: () => ["appointments"] as const,
    day: (branchId: string | undefined, dayStart: number) =>
      ["appointments", "day", branchId, dayStart] as const,
    week: (branchId: string | undefined, weekStart: string) =>
      ["appointments", "week", branchId, weekStart] as const
  },

  patients: {
    search: (term: string) => ["patients", term] as const,
    detail: (id: string | undefined) => ["patient", id] as const
  },

  rosterValidation: {
    root: () => ["roster-validate"] as const,
    for: (request: unknown) => ["roster-validate", request] as const
  },

  auditLogs: (
    category: string,
    actor: string,
    fromDate: string,
    toDate: string
  ) => ["audit-logs", category, actor, fromDate, toDate] as const,

  availability: (
    serviceId: string | undefined,
    branchId: string | undefined,
    dentistId: string | undefined,
    date: string
  ) => ["availability", serviceId, branchId, dentistId, date] as const,

  publicClinic: (clinicSlug: string) => ["public-clinic", clinicSlug] as const,

  publicAvailability: {
    root: () => ["public-availability"] as const,
    for: (
      clinicSlug: string,
      serviceId: string | null,
      branchId: string | null,
      dentistId: string | null,
      date: string
    ) =>
      ["public-availability", clinicSlug, serviceId, branchId, dentistId ?? "any", date] as const
  },

  publicManage: {
    root: () => ["public-manage"] as const,
    byToken: (token: string) => ["public-manage", token] as const
  }
} as const
