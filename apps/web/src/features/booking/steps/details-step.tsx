import { FormEvent, useState } from "react"
import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"
import { Field, FieldInput } from "../../../components/ui/form-field"
import { PHONE_ERROR, isValidPhone } from "../../../lib/phone"
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

const isBookable = (details: WizardDetails): boolean =>
  details.name.trim().length > 0 && isValidPhone(details.phone)

const phoneError = (phone: string): string | undefined => {
  if (phone.trim().length === 0) return undefined
  return isValidPhone(phone) ? undefined : PHONE_ERROR
}

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
    <form className="flex flex-1 flex-col gap-4" onSubmit={submit} noValidate>
      <CountdownBanner expiresAt={hold.expiresAt} startsAt={hold.startsAt} onExpire={onExpire} />
      <Card className="w-full px-4 py-3 text-left">
        <dl>
          <Row label="When" value={`${fmtDay(bkkDate(startsAt))} · ${fmtTime(startsAt)}`} numeric />
          <Row label="Treatment" value={recap.serviceName} />
          <Row label="Dentist" value={recap.dentistName} />
          <Row label="Where" value={recap.branchName} />
        </dl>
      </Card>
      <h2 className="type-section-title font-semibold">Your details</h2>
      <Field id="booking-name" label="Full name">
        {(aria) => (
          <FieldInput
            {...aria}
            name="name"
            autoComplete="name"
            value={details.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        )}
      </Field>
      <Field id="booking-phone" label="Mobile number" error={phoneErrorMessage}>
        {(aria) => (
          <FieldInput
            {...aria}
            name="tel"
            type="tel"
            className="tabular-nums"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812345678"
            value={details.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            onBlur={() => setPhoneTouched(true)}
          />
        )}
      </Field>
      <Field id="booking-email" label="Email (optional)">
        {(aria) => (
          <FieldInput
            {...aria}
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={details.email}
            onChange={(event) => onChange({ email: event.target.value })}
          />
        )}
      </Field>
      <div className="sticky bottom-0 mt-auto bg-background pb-[env(safe-area-inset-bottom)] pt-3">
        <Button type="submit" size="lg" className="w-full" disabled={!isBookable(details) || submitting}>
          {submitting ? "Booking…" : "Confirm booking"}
        </Button>
      </div>
    </form>
  )
}
