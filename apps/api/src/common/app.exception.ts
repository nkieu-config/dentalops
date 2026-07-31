import { HttpException } from "@nestjs/common"

export class AppException extends HttpException {
  constructor(status: number, errorCode: string, message: string, details?: unknown) {
    super({ message, errorCode, details }, status)
  }
}
