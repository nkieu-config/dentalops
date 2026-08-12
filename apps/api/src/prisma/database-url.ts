export const POOL_LIMIT = 5

export const CONNECT_TIMEOUT_SECONDS = 10

const POOLER_HOST = "-pooler."

const withParam = (url: string, name: string, value: number): string => {
  if (!url || url.includes(`${name}=`)) return url
  return `${url}${url.includes("?") ? "&" : "?"}${name}=${value}`
}

export const isNeon = (url: string): boolean => url.includes(".neon.tech")

export const isPooled = (url: string): boolean => url.includes(POOLER_HOST)

export const withPoolLimit = (url: string, limit = POOL_LIMIT): string =>
  withParam(url, "connection_limit", limit)

export const withConnectTimeout = (url: string, seconds = CONNECT_TIMEOUT_SECONDS): string =>
  withParam(url, "connect_timeout", seconds)

export const clientUrl = (url: string): string => withConnectTimeout(withPoolLimit(url))

export const poolingAdvice = (databaseUrl?: string, directUrl?: string): string | null => {
  if (!databaseUrl || !isNeon(databaseUrl)) return null
  if (!isPooled(databaseUrl)) {
    return "DATABASE_URL points at a Neon compute directly; use the -pooler host so the app shares PgBouncer connections"
  }
  if (directUrl && isPooled(directUrl)) {
    return "DIRECT_URL points at the Neon pooler; migrations need the direct host, because PgBouncer cannot hold the advisory locks Prisma takes"
  }
  return null
}
