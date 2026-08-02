import type { Violation } from "@dentalops/contracts"
import { AlertTriangle, CircleCheck, OctagonAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router"
import { cn } from "../../lib/cn"

export interface ViolationLink {
  href: string
  label: string
}

interface ViolationListProps {
  violations: Violation[]
  staffName: (staffId: string) => string
  linkFor?: (violation: Violation) => ViolationLink | null
}

interface GroupProps extends ViolationListProps {
  heading: string
  icon: LucideIcon
  tone: string
  testId: string
}

const Group = ({ violations, staffName, linkFor, heading, icon: Icon, tone, testId }: GroupProps) =>
  violations.length === 0 ? null : (
    <div data-testid={testId}>
      <h3 className={cn("flex items-center gap-1.5 text-sm font-semibold", tone)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {heading} (<span className="tabular-nums">{violations.length}</span>)
        </span>
      </h3>
      <ul className="mt-2 space-y-2">
        {violations.map((violation, index) => {
          const link = linkFor?.(violation) ?? null
          return (
            <li
              key={`${violation.rule}-${violation.staffId}-${index}`}
              className="flex gap-2 rounded-md border border-border p-2 text-sm"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-label={heading} />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{staffName(violation.staffId)}</p>
                <p className="text-muted-foreground">{violation.detail}</p>
                {link ? (
                  <Link
                    to={link.href}
                    className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )

export const ViolationList = ({ violations, staffName, linkFor }: ViolationListProps) => {
  const blocking = violations.filter((v) => v.severity === "block")
  const warnings = violations.filter((v) => v.severity === "warn")

  if (violations.length === 0) {
    return (
      <p
        data-testid="violations-clean"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        No violations
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Group
        testId="violations-blocking"
        heading="Blocking"
        icon={OctagonAlert}
        tone="text-destructive"
        violations={blocking}
        staffName={staffName}
        linkFor={linkFor}
      />
      <Group
        testId="violations-warnings"
        heading="Warnings"
        icon={AlertTriangle}
        tone="text-warning"
        violations={warnings}
        staffName={staffName}
      />
    </div>
  )
}
