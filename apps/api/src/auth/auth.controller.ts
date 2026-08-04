import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle, Throttle } from "@nestjs/throttler"
import type { Request, Response } from "express"
import { AuthService } from "./auth.service"
import { CurrentUser } from "./current-user.decorator"
import { DemoLoginDto } from "./dto/demo-login.dto"
import { LoginDto } from "./dto/login.dto"
import { Public } from "./public.decorator"
import { SignupDto } from "./dto/signup.dto"
import { AuthenticatedUser } from "./jwt.strategy"

const REFRESH_COOKIE = "dentalops_refresh"

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000
}

const CREDENTIAL_ATTEMPTS = { default: { limit: 10, ttl: 60_000 } }

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private respond(
    res: Response,
    result: { user: { id: string; tenantId: string; name: string; role: string }; tokens: { accessToken: string; refreshToken: string } }
  ) {
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions)
    return res.json({
      accessToken: result.tokens.accessToken,
      user: {
        id: result.user.id,
        tenantId: result.user.tenantId,
        name: result.user.name,
        role: result.user.role
      }
    })
  }

  @Post("signup")
  @Public()
  @Throttle(CREDENTIAL_ATTEMPTS)
  @HttpCode(200)
  async signup(@Body() dto: SignupDto, @Res() res: Response) {
    return this.respond(res, await this.auth.signup(dto))
  }

  @Post("login")
  @Public()
  @Throttle(CREDENTIAL_ATTEMPTS)
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    return this.respond(res, await this.auth.login(dto))
  }

  @Post("demo-login")
  @Public()
  @HttpCode(200)
  async demoLogin(@Body() dto: DemoLoginDto, @Res() res: Response) {
    return this.respond(res, await this.auth.demoLogin(dto))
  }

  @Post("refresh")
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]
    return this.respond(res, await this.auth.refresh(token))
  }

  @Get("me")
  @SkipThrottle()
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user
  }
}
