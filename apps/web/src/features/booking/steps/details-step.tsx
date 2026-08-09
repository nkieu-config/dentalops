import { AlertCircle } from "lucide-react"
import { FormEvent, useState } from "react"
import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { bkkDate, fmtDay, fmtTime } from "../../timeline/lib/geometry"
import { Row } from "../booking-summary"
import { CountdownBanner } from "../countdown-banner"
import type { WizardDetails, WizardHold } from "../wizard-reducer"

export interface AppointmentRecap {
  serviceName: string
  dentistName: string
  branchName: string
}

interface DetailsStepProps {
  hold: WizardHold
  recap: AppointmentRecap
  details: WizardDetails
  submitting: boolean
  onChange: (patch: Partial<WizardDetails>) => void
  onSubmit: () => void
  onExpire: () => void
}

const PHONE_PATTERN = /^0\d{8,9}$/
const PHONE_ERROR_ID = "booking-phone-error"

const isBookable = (details: WizardDetails): boolean =>
  details.name.trim().length > 0 && PHONE_PATTERN.test(details.phone.trim())

const phoneError = (phone: string): string | undefined => {
  const trimmed = phone.trim()
  if (trimmed.length === 0) return undefined
  return PHONE_PATTERN.test(trimmed) ? undefined : "Enter a valid mobile number, e.g. 0812345678"
}

const field = "min-h-11 w-full text-base"

export const DetailsStep = ({
  hold,
  recap,
  details,
  submitting,
  onChange,
  onSubmit,
  onExpire
}: DetailsStepProps) => {
  const [phoneTouched, setPhoneTouched] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setPhoneTouched(true)
    if (isBookable(details) && !submitting) onSubmit()
  }

  const startsAt = Date.parse(hold.startsAt)
  const phoneErrorMessage = phoneTouched ? phoneError(details.phone) : undefined

  return (
    <form className="flex flex-1 flex-col gap-4" onSubmit={submit}>
      <CountdownBanner expiresAt={hold.expiresAt} startsAt={hold.startsAt} onExpire={onExpire} />
      <Card className="w-full px-4 py-3 text-left">
        <dl>
          <Row label="When" value={`${fmtDay(bkkDate(startsAt))} · ${fmtTime(startsAt)}`} numeric />
          <Row label="Treatment" value={recap.serviceName} />
          <Row label="Dentist" value={recap.dentistName} />
          <Row label="Where" value={recap.branchName} />
        </dl>
      </Card>
      <h2 className="text-section-title font-bold">Your details</h2>
      <div className="space-y-1">
        <label className="block text-base font-medium" htmlFor="booking-name">
          Full name
        </label>
        <Input
          id="booking-name"
          className={field}
          autoComplete="name"
          value={details.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-base font-medium" htmlFor="booking-phone">
          Mobile number
        </label>
        <Input
          id="booking-phone"
          className={`${field} tabular-nums`}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812345678"
          value={details.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          onBlur={() => setPhoneTouched(true)}
          aria-invalid={phoneErrorMessage !== undefined}
          aria-describedby={phoneErrorMessage ? PHONE_ERROR_ID : undefined}
        />
        {phoneErrorMessage ? (
          <p
            id={PHONE_ERROR_ID}
            className="flex items-start gap-1.5 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {phoneErrorMessage}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <label className="block text-base font-medium" htmlFor="booking-email">
          Email <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="booking-email"
          className={field}
          type="email"
          autoComplete="email"
          value={details.email}
          onChange={(event) => onChange({ email: event.target.value })}
        />
      </div>
      <div className="sticky bottom-0 mt-auto bg-background pt-3">
        <Button
          type="submit"
          className="min-h-12 w-full text-base"
          disabled={!isBookable(details) || submitting}
        >
          {submitting ? "Booking…" : "Confirm booking"}
        </Button>
      </div>
    </form>
  )
}
