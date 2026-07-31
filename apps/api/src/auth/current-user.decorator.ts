import { ExecutionContext, createParamDecorator } from "@nestjs/common"
import { AuthenticatedUser } from "./jwt.strategy"

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user
)
