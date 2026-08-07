import type { ClinicProfile } from "@dentalops/contracts"

export const ClinicIdentity = ({ clinic }: { clinic?: ClinicProfile }) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-meta font-bold text-primary-foreground">D</span>
    <span className="truncate text-sm font-bold">{clinic?.name ?? "DentalOps"}</span>
  </div>
)
