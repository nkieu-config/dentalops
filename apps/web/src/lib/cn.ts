import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const semanticTypeRoles = [
  "type-display",
  "type-display-lg",
  "type-page-title",
  "type-section-title",
  "type-subsection-title",
  "type-dialog-title",
  "type-card-title",
  "type-body",
  "type-ui",
  "type-supporting",
  "type-meta",
  "type-dense"
] as const

const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": semanticTypeRoles
    }
  }
})

export const cn = (...inputs: ClassValue[]) => mergeClasses(clsx(inputs))
