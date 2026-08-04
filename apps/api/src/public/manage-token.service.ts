import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { AppException } from "../common/app.exception"
import { currentTenant } from "../tenant/tenant-context"
import { secretFor } from "../auth/token-secrets"

export const MANAGE_PURPOSE = "manage"
export const MANAGE_TOKEN_TTL = "30d"

export interface ManageTokenClaims {
  sub: string
  tenantId: string
  purpose: string
}

const invalidToken = () =>
  new AppException(401, "INVALID_MANAGE_TOKEN", "This booking link is invalid or has expired")

@Injectable()
export class ManageTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(appointmentId: string): Promise<string> {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
    return this.jwt.signAsync(
      { sub: appointmentId, tenantId: ctx.tenantId, purpose: MANAGE_PURPOSE },
      { secret: secretFor("manage"), expiresIn: MANAGE_TOKEN_TTL }
    )
  }

  async verify(token: string): Promise<ManageTokenClaims> {
    let claims: ManageTokenClaims
    try {
      claims = await this.jwt.verifyAsync<ManageTokenClaims>(token, {
        secret: secretFor("manage")
      })
    } catch {
      throw invalidToken()
    }
    if (claims.purpose !== MANAGE_PURPOSE) throw invalidToken()
    if (typeof claims.sub !== "string" || typeof claims.tenantId !== "string") throw invalidToken()
    if (!claims.sub || !claims.tenantId) throw invalidToken()
    return claims
  }
}
