import { cva } from "class-variance-authority"
import { disabledControl, focusRing } from "./focus-ring"

export const selectTriggerVariants = cva(
  `group relative flex min-w-0 touch-manipulation cursor-pointer items-center justify-between gap-2 overflow-hidden border border-input bg-card text-left type-ui font-medium text-foreground shadow-[var(--shadow-select)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-primary/60 hover:bg-surface-subtle/60 active:scale-[0.99] data-[state=open]:border-primary data-[state=open]:bg-card data-[state=open]:ring-2 data-[state=open]:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[placeholder]:font-normal data-[placeholder]:text-muted-foreground ${focusRing} ${disabledControl}`,
  {
    variants: {
      variant: {
        field: "h-11 w-full rounded-control py-0 pl-3 pr-2 sm:h-10 [@media(pointer:coarse)]:h-11",
        toolbar: "h-11 rounded-full py-0 pl-3.5 pr-2 sm:h-10 [@media(pointer:coarse)]:h-11",
        compact: "h-9 rounded-control py-0 pl-2.5 pr-1.5"
      }
    },
    defaultVariants: {
      variant: "field"
    }
  }
)

export const selectIndicatorWellClass =
  "ml-auto flex size-7 shrink-0 items-center justify-center rounded-[calc(var(--radius-control)-0.125rem)] border border-border/80 bg-surface-subtle text-muted-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.72)] transition-[background-color,border-color,color,transform] duration-150 group-hover:border-primary/30 group-hover:text-foreground group-data-[state=open]:border-primary/40 group-data-[state=open]:bg-secondary group-data-[state=open]:text-primary dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"

export const selectChevronClass =
  "size-4 transition-transform duration-150 group-data-[state=open]:rotate-180"
