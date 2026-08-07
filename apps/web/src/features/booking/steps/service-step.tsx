import type { PublicClinic } from "@dentalops/contracts"
import { ChevronRight } from "lucide-react"
import { Skeleton } from "../../../components/ui/skeleton"

interface ServiceStepProps {
  branches: PublicClinic["branches"]
  services: PublicClinic["services"]
  branchId: string | null
  loading: boolean
  onChooseBranch: (branchId: string) => void
  onChooseService: (serviceId: string) => void
}

export const ServiceStep = ({
  branches,
  services,
  branchId,
  loading,
  onChooseBranch,
  onChooseService
}: ServiceStepProps) => (
  <div className="space-y-6">
    {branches.length > 1 ? (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Which branch?</h2>
        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              aria-pressed={branch.id === branchId}
              onClick={() => onChooseBranch(branch.id)}
              className={
                branch.id === branchId
                  ? "min-h-11 rounded-md border border-primary bg-secondary px-4 text-base font-medium text-secondary-foreground"
                  : "min-h-11 cursor-pointer rounded-md border border-border px-4 text-base hover:bg-accent"
              }
            >
              {branch.name}
            </button>
          ))}
        </div>
      </div>
    ) : null}

    <div className="space-y-2">
      <h2 className="text-lg font-semibold">What do you need?</h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} data-testid="service-skeleton" className="h-16 w-full" />
          ))}
        </div>
      ) : null}
      <ul className="space-y-2">
        {services.map((service) => (
          <li key={service.id}>
            <button
              type="button"
              data-testid="service-option"
              onClick={() => onChooseService(service.id)}
              className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
            >
              <span>
                <span className="block text-base font-medium">{service.name}</span>
                <span className="block text-base tabular-nums text-muted-foreground">
                  {service.durationMin} min
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  </div>
)
