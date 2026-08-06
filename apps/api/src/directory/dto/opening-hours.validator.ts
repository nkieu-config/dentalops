import { openingHoursSchema } from "@dentalops/contracts"
import { ValidatorConstraint, type ValidationArguments, type ValidatorConstraintInterface } from "class-validator"

@ValidatorConstraint({ name: "openingHours", async: false })
export class OpeningHoursConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return openingHoursSchema.safeParse(value).success
  }

  defaultMessage(_arguments: ValidationArguments): string {
    return "openingHours must contain ordered, non-overlapping HH:mm intervals for every day"
  }
}
