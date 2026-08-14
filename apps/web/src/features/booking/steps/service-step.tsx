import type { PublicClinic } from "@dentalops/contracts"
import { Skeleton } from "../../../components/ui/skeleton"
import { OptionCard } from "../option-card"

const weekday = (timezone: string): keyof PublicClinic["branches"][number]["openingHours"] =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone })
    .format(new Date())
    .toLowerCase() as keyof PublicClinic["branches"][number]["openingHours"]

const openingLabel = (branch: PublicClinic["branches"][number]): string => {
  const intervals = branch.openingHours[weekday(branch.timezone)]
  if (intervals.length === 0) return "Closed today"
  return `Open today ${intervals.map(([from, to]) => `${from}–${to}`).join(", ")}`
}

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
        <h2 className="type-section-title font-semibold">Which branch?</h2>
        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              aria-pressed={branch.id === branchId}
              onClick={() => onChooseBranch(branch.id)}
              className={
                branch.id === branchId
                  ? "min-h-11 cursor-pointer rounded-card border border-primary bg-secondary px-4 type-card-title font-medium text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  : "min-h-11 cursor-pointer rounded-card border border-border px-4 type-card-title hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              }
            >
              {branch.name}
            </button>
          ))}
        </div>
        {branchId ? (
          <p className="type-supporting text-muted-foreground">
            {openingLabel(branches.find((branch) => branch.id === branchId)!)}
          </p>
        ) : null}
      </div>
    ) : null}

    <div className="space-y-2">
      <h2 className="type-section-title font-semibold">What do you need?</h2>
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
            <OptionCard
              testId="service-option"
              title={service.name}
              detail={`${service.durationMin} min`}
              onClick={() => onChooseService(service.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  </div>
)
