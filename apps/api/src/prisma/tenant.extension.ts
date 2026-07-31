import { Prisma } from "@prisma/client"
import { currentTenant } from "../tenant/tenant-context"

const TENANT_MODELS = new Set([
  "User",
  "Branch",
  "Service",
  "EquipmentType",
  "Resource",
  "ServiceEquipmentRequirement",
  "Patient",
  "ShiftSeries",
  "Shift",
  "TimeBlock",
  "AppointmentSeries",
  "Appointment",
  "ResourceClaim"
])

const LIST_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany"
])

const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"])

export const tenantExtension = Prisma.defineExtension({
  name: "tenantScope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args)
        const ctx = currentTenant()
        if (!ctx) {
          throw new Error(`Tenant-scoped query on ${model}.${operation} outside tenant context`)
        }
        const tenantId = ctx.tenantId
        const a = args as Record<string, unknown>

        if (operation === "create") {
          a.data = { ...(a.data as object), tenantId }
          return query(a)
        }
        if (operation === "createMany" || operation === "createManyAndReturn") {
          const data = a.data
          a.data = Array.isArray(data)
            ? data.map((d: object) => ({ ...d, tenantId }))
            : { ...(data as object), tenantId }
          return query(a)
        }
        if (LIST_OPS.has(operation)) {
          a.where = { AND: [(a.where as object) ?? {}, { tenantId }] }
          return query(a)
        }
        if (UNIQUE_OPS.has(operation)) {
          a.where = { ...(a.where as object), tenantId }
          return query(a)
        }
        return query(a)
      }
    }
  }
})
