import { cva, type VariantProps } from "class-variance-authority"
import { HTMLAttributes } from "react"
import { cn } from "../../lib/cn"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-meta font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-secondary-foreground",
        success: "bg-success-surface text-success-on-surface",
        warning: "bg-warning-surface text-warning-on-surface",
        destructive: "bg-destructive-surface text-destructive-on-surface",
        decorative: "bg-decorative-surface text-decorative-on-surface"
      }
    },
    defaultVariants: { tone: "neutral" }
  }
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
)
