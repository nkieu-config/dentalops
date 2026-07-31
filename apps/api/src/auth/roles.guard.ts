import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { AppException } from "../common/app.exception"
import { ROLES_KEY } from "./roles.decorator"
import { AuthenticatedUser } from "./jwt.strategy"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!required || required.length === 0) return true
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user
    if (!user || !required.includes(user.role)) {
      throw new AppException(403, "FORBIDDEN", "Insufficient role for this action")
    }
    return true
  }
}
