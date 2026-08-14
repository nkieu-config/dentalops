import { HTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("animate-pulse rounded-control bg-muted", className)} {...props} />
)
