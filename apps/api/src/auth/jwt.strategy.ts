import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { JwtPayload } from "./auth.service"
import { secretFor } from "./token-secrets"

export interface AuthenticatedUser {
  userId: string
  tenantId: string
  role: string
  name: string
}

export const STAFF_ROLES: ReadonlySet<string> = new Set(["owner", "receptionist", "dentist"])

export const isStaffSession = (payload: Partial<JwtPayload> | null): payload is JwtPayload =>
  typeof payload?.sub === "string" &&
  typeof payload.tenantId === "string" &&
  typeof payload.name === "string" &&
  typeof payload.role === "string" &&
  STAFF_ROLES.has(payload.role)

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secretFor("access")
    })
  }

  validate(payload: Partial<JwtPayload>): AuthenticatedUser {
    if (!isStaffSession(payload)) throw new UnauthorizedException()
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      name: payload.name
    }
  }
}
