import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const SIGNED = "[\\w-]+\\.[\\w-]+\\.[\\w-]+"

export const MAX_HOLD_ID_LENGTH = 1024
export const HOLD_ID_PATTERN = new RegExp(`^(${UUID}|${SIGNED})$`, "i")
export const HOLD_ID_MESSAGE = "holdId must be a hold identifier"

const SIGNED_HOLD_PATTERN = new RegExp(`^${SIGNED}$`)

export const isSignedHold = (value: string): boolean => SIGNED_HOLD_PATTERN.test(value)

@Injectable()
export class ParseHoldIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (value.length > MAX_HOLD_ID_LENGTH || !HOLD_ID_PATTERN.test(value)) {
      throw new BadRequestException(HOLD_ID_MESSAGE)
    }
    return value
  }
}
