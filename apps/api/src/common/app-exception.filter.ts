import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import * as Sentry from "@sentry/nestjs"
import type { Request, Response } from "express"

const ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED"
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request & { id?: string }>()
    const requestId = req.id ?? "unknown"

    const exclusion =
      exception instanceof Error
        ? exception.message.match(/exclusion constraint \\?"(\w+)\\?"/)
        : null
    if (exclusion) {
      return res.status(409).json({
        statusCode: 409,
        errorCode: "SLOT_CONFLICT",
        message: "The requested time conflicts with an existing booking",
        details: { constraint: exclusion[1] },
        requestId
      })
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === "P2025"
    ) {
      return res.status(404).json({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Resource not found",
        requestId
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse() as
        | string
        | { message?: string | string[]; errorCode?: string; details?: unknown }
      const rawMessage =
        typeof body === "string" ? body : (body.message ?? exception.message)
      const isValidation = status === 400 && Array.isArray(rawMessage)
      return res.status(status).json({
        statusCode: status,
        errorCode:
          typeof body === "object" && body.errorCode
            ? body.errorCode
            : isValidation
              ? "VALIDATION_ERROR"
              : (ERROR_CODE_BY_STATUS[status] ?? "HTTP_ERROR"),
        message: Array.isArray(rawMessage) ? rawMessage.join("; ") : String(rawMessage),
        details: typeof body === "object" ? body.details : undefined,
        requestId
      })
    }

    Sentry.captureException(exception)
    return res.status(500).json({
      statusCode: 500,
      errorCode: "INTERNAL",
      message: "Internal server error",
      requestId
    })
  }
}
