type WithoutTenant<T> = Omit<T, "tenantId">

export const scoped = <T extends { tenantId: string }>(data: WithoutTenant<T>): T => data as T

export const scopedMany = <T extends { tenantId: string }>(data: WithoutTenant<T>[]): T[] =>
  data as T[]
