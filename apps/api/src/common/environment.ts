export class MisconfiguredEnvironment extends Error {}

export const isProduction = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === "production"

export const assertProductionEnv = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!isProduction(env)) return
  if (!env.WEB_ORIGIN) {
    throw new MisconfiguredEnvironment(
      "WEB_ORIGIN is not set; confirmation emails would send patients a localhost manage link"
    )
  }
}
