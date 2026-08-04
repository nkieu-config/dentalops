import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { User } from "@prisma/client"
import * as argon2 from "argon2"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
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
}

const DEMO_SLUG = "demo-clinic"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name
    }
    const accessToken = await this.jwt.signAsync(payload, {
      secret: secretFor("access"),
      expiresIn: "15m"
    })
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: secretFor("refresh"),
      expiresIn: "7d"
    })
    return { accessToken, refreshToken }
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
      }
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
    return { user, tokens: await this.issueTokens(user) }
  }
}
