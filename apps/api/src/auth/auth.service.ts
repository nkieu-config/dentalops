import { Inject, Injectable, Logger } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { User } from "@prisma/client"
import * as argon2 from "argon2"
import Redis from "ioredis"
import { randomUUID } from "node:crypto"
import { AppException } from "../common/app.exception"
import { DegradationLog } from "../common/degradation-log"
import { PrismaService } from "../prisma/prisma.service"
import { REDIS } from "../redis/redis.module"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../tenant/defaults"
import { DemoLoginDto } from "./dto/demo-login.dto"
import { LoginDto } from "./dto/login.dto"
import { SignupDto } from "./dto/signup.dto"
import { secretFor } from "./token-secrets"

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string
  tenantId: string
  role: string
  name: string
  jti: string
}

const DEMO_SLUG = "demo-clinic"
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

const sessionKey = (userId: string, jti: string) => `auth-session:${userId}:${jti}`

@Injectable()
export class AuthService {
  private readonly outage = new DegradationLog(
    new Logger(AuthService.name),
    "refresh-token revocation is degraded; sessions cannot be checked or rotated until Redis recovers",
    "refresh-token revocation restored"
  )

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  private async issueTokens(user: User, replaces?: string): Promise<AuthTokens> {
    const jti = randomUUID()
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
      jti
    }
    const accessToken = await this.jwt.signAsync(payload, {
      secret: secretFor("access"),
      expiresIn: "15m"
    })
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: secretFor("refresh"),
      expiresIn: "7d"
    })
    await this.rotateSession(user.id, jti, replaces)
    return { accessToken, refreshToken }
  }

  private async rotateSession(userId: string, jti: string, replaces?: string): Promise<void> {
    try {
      const rotation = this.redis.pipeline()
      if (replaces) rotation.del(sessionKey(userId, replaces))
      rotation.set(sessionKey(userId, jti), "1", "EX", REFRESH_TTL_SECONDS)
      await rotation.exec()
      this.outage.clear()
    } catch (error) {
      this.outage.report(error)
    }
  }

  private async isActiveSession(userId: string, jti: string | undefined): Promise<boolean> {
    if (!jti) return false
    try {
      const live = await this.redis.exists(sessionKey(userId, jti))
      this.outage.clear()
      return live === 1
    } catch (error) {
      this.outage.report(error)
      return true
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return
    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: secretFor("refresh")
      })
    } catch {
      return
    }
    try {
      await this.redis.del(sessionKey(payload.sub, payload.jti))
    } catch {
      // best effort: clearing the browser's cookie is what actually ends the session client-side
    }
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })
    if (existing) throw new AppException(409, "SLUG_TAKEN", "That clinic URL is already in use")

    const passwordHash = await argon2.hash(dto.password)
    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug: dto.slug, name: dto.clinicName }
      })
      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: "Main Branch", openingHours: DEFAULT_OPENING_HOURS }
      })
      await tx.resource.createMany({
        data: [1, 2, 3].map((n) => ({
          tenantId: tenant.id,
          branchId: branch.id,
          type: "chair" as const,
          name: `Chair ${n}`
        }))
      })
      await tx.service.createMany({
        data: DEFAULT_SERVICES.map((s) => ({ tenantId: tenant.id, bufferMin: 10, ...s }))
      })
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
          role: "owner"
        }
      })
    })
    return { user, tokens: await this.issueTokens(user) }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        isActive: true,
        tenant: { slug: dto.clinicSlug }
      },
      omit: { passwordHash: false }
    })
    const valid = user && (await argon2.verify(user.passwordHash, dto.password))
    if (!valid) throw new AppException(401, "INVALID_CREDENTIALS", "Wrong clinic, email, or password")
    return { user, tokens: await this.issueTokens(user) }
  }

  async demoLogin(dto: DemoLoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { role: dto.role, isActive: true, tenant: { slug: DEMO_SLUG } },
      orderBy: { email: "asc" }
    })
    if (!user) throw new AppException(503, "DEMO_UNAVAILABLE", "Demo tenant is not seeded")
    return { user, tokens: await this.issueTokens(user) }
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new AppException(401, "NO_REFRESH_TOKEN", "Missing refresh token")
    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: secretFor("refresh")
      })
    } catch {
      throw new AppException(401, "INVALID_REFRESH_TOKEN", "Refresh token invalid or expired")
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true }
    })
    if (!user) throw new AppException(401, "INVALID_REFRESH_TOKEN", "User no longer active")
    if (!(await this.isActiveSession(user.id, payload.jti))) {
      throw new AppException(401, "INVALID_REFRESH_TOKEN", "Session has been revoked")
    }
    return { user, tokens: await this.issueTokens(user, payload.jti) }
  }
}
