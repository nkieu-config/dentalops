import { AsyncLocalStorage } from "node:async_hooks"

export interface TenantContextData {
  tenantId: string
  userId: string
  role: string
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>()

export function currentTenant(): TenantContextData | undefined {
  return tenantContext.getStore()
}
