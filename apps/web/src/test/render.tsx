import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { TooltipProvider } from "../components/ui/tooltip"

const withProviders = (ui: ReactNode) => <TooltipProvider>{ui}</TooltipProvider>

export const render = (ui: ReactElement, options?: RenderOptions): RenderResult => {
  const result = rtlRender(withProviders(ui), options)
  return { ...result, rerender: (next: ReactNode) => result.rerender(withProviders(next)) }
}

export * from "@testing-library/react"
