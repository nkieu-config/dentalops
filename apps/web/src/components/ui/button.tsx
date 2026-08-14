import { cva, type VariantProps } from "class-variance-authority"
import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"
import { disabledControl, focusRing } from "./focus-ring"

export const buttonVariants = cva(
  `inline-flex touch-manipulation items-center justify-center gap-2 rounded-control type-ui font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] cursor-pointer ${focusRing} ${disabledControl}`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90"
      },
      size: {
        default: "h-11 px-4 sm:h-10 [@media(pointer:coarse)]:h-11",
        sm: "h-9 px-3 [@media(pointer:coarse)]:h-11",
        lg: "min-h-12 px-5 type-body",
        icon: "h-11 w-11 sm:h-10 sm:w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
Button.displayName = "Button"
