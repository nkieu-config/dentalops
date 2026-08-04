import { createHmac } from "node:crypto"

export const TOKEN_PURPOSES = ["access", "refresh", "manage", "hold"] as const

export type TokenPurpose = (typeof TOKEN_PURPOSES)[number]

const ROOT: Record<TokenPurpose, "JWT_SECRET" | "JWT_REFRESH_SECRET"> = {
  access: "JWT_SECRET",
  refresh: "JWT_REFRESH_SECRET",
  manage: "JWT_SECRET",
  hold: "JWT_SECRET"
}

export const requireSecret = (name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; refusing to start without it`)
  return value
}

export const secretFor = (purpose: TokenPurpose): string =>
  createHmac("sha256", requireSecret(ROOT[purpose])).update(`dentalops:${purpose}`).digest("hex")
