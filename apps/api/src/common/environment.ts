export class MisconfiguredEnvironment extends Error {}

export const isProduction = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === "production"

// WEB_ORIGIN falls back to localhost in three places: the CORS allowlist, the
// realtime gateway, and the manage link inside every confirmation email. The
// first two fail loudly — the browser is simply refused. The third does not:
// the API happily mails patients a link to a machine that is not theirs, and
// nothing server-side ever notices. In production, refusing to start is the
// smaller harm.
export const assertProductionEnv = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!isProduction(env)) return
  if (!env.WEB_ORIGIN) {
    throw new MisconfiguredEnvironment(
      "WEB_ORIGIN is not set; confirmation emails would send patients a localhost manage link"
    )
  }
}
