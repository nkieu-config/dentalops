import { FormEvent, type ReactNode } from "react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { CountdownBanner } from "../countdown-banner"
import type { WizardDetails, WizardHold } from "../wizard-reducer"

interface DetailsStepProps {
  hold: WizardHold
  details: WizardDetails
  submitting: boolean
  recap: ReactNode
  onChange: (patch: Partial<WizardDetails>) => void
  onSubmit: () => void
  onExpire: () => void
}

const PHONE_PATTERN = /^0\d{8,9}$/

const isBookable = (details: WizardDetails): boolean =>
  details.name.trim().length > 0 && PHONE_PATTERN.test(details.phone.trim())

const field = "min-h-11 w-full text-base"

export const DetailsStep = ({
  hold,
  details,
  submitting,
  recap,
  onChange,
  onSubmit,
  onExpire
}: DetailsStepProps) => {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isBookable(details) && !submitting) onSubmit()
  }

  return (
    <form className="flex flex-1 flex-col gap-4" onSubmit={submit}>
      <CountdownBanner expiresAt={hold.expiresAt} startsAt={hold.startsAt} onExpire={onExpire} />
      <h2 className="text-lg font-semibold">Your details</h2>
      {recap}
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
        />
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
