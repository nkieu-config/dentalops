import type { ClinicProfile } from "@dentalops/contracts"
import { BrandMark } from "../ui/brand-mark"
import { Skeleton } from "../ui/skeleton"

interface ClinicIdentityProps {
  clinic?: ClinicProfile
  loading?: boolean
  error?: boolean
}

export const ClinicIdentity = ({ clinic, loading = false, error = false }: ClinicIdentityProps) => (
  <div className="flex min-w-0 items-center gap-2">
    <BrandMark className="size-8 shrink-0" />
    {loading ? (
      <Skeleton data-testid="clinic-identity-skeleton" className="h-4 w-28 sm:w-40" />
    ) : (
      <span
        title={clinic?.name}
        className="max-w-28 truncate type-ui font-semibold min-[420px]:max-w-40 sm:max-w-64"
      >
        {error ? "Clinic workspace" : (clinic?.name ?? "Clinic workspace")}
      </span>
    )}
  </div>
)
