import type { PublicBooking } from "@dentalops/contracts"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { Button } from "../../../components/ui/button"
import { BookingSummary } from "../booking-summary"

interface ConfirmedStepProps {
  booking: PublicBooking
  clinicName: string
  emailProvided: boolean
}

export const ConfirmedStep = ({ booking, clinicName, emailProvided }: ConfirmedStepProps) => {
  const { appointment, manageToken } = booking
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const managePath = `/manage/${manageToken}`
  const manageUrl = new URL(managePath, window.location.origin).toString()

  const copyManageLink = async () => {
    if (!navigator.clipboard) {
      setCopyError(true)
      return
    }

    try {
      await navigator.clipboard.writeText(manageUrl)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }

  const shareManageLink = async () => {
    await navigator.share?.({ title: `${clinicName} booking`, url: manageUrl })
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
      <h2 className="type-section-title font-semibold">You are booked</h2>
      <p className="type-body text-muted-foreground">{clinicName}</p>
      <BookingSummary appointment={appointment} />
      <Link
        to={managePath}
        className="inline-flex min-h-11 items-center rounded-control border border-border px-4 type-body font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Change or cancel this booking
      </Link>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => void copyManageLink()}>
          {copied ? "Manage link copied" : "Copy manage link"}
        </Button>
        {typeof navigator.share === "function" ? (
          <Button variant="secondary" onClick={() => void shareManageLink()}>
            Share
          </Button>
        ) : null}
      </div>
      {copyError ? <p role="alert" className="type-body font-medium text-destructive">Could not copy the manage link. Select and copy it manually.</p> : null}
      <p className="type-body text-muted-foreground">
        {emailProvided
          ? "A confirmation email will be sent to the address you provided."
          : "No confirmation email was sent. Save this link to manage your booking."}
      </p>
    </div>
  )
}
