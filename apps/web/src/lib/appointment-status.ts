import type { AppointmentStatus } from "@dentalops/contracts"
import type { BadgeTone } from "../components/ui/badge"

export type AppointmentStatusChange = Exclude<AppointmentStatus, "confirmed">

interface StatusPresentation {
  label: string
  tone: BadgeTone
  activityPhrase: string
  closedNote?: string
}

interface StatusChangeCopy {
  title: string
  confirmLabel: string
  confirmVariant: "default" | "secondary" | "destructive"
  describe: (patientName: string, serviceName: string) => string
}

export const appointmentStatus: Record<AppointmentStatus, StatusPresentation> = {
  confirmed: {
    label: "Confirmed",
    tone: "neutral",
    activityPhrase: "confirmed an appointment"
  },
  completed: {
    label: "Completed",
    tone: "success",
    activityPhrase: "marked an appointment completed",
    closedNote: "Completed visits cannot be reopened."
  },
  cancelled: {
    label: "Cancelled",
    tone: "destructive",
    activityPhrase: "cancelled an appointment",
    closedNote: "Cancelled appointments cannot be restored."
  },
  no_show: {
    label: "No-show",
    tone: "warning",
    activityPhrase: "marked an appointment a no-show",
    closedNote: "A no-show cannot be undone."
  }
}

export const readAppointmentStatus = (value: string | undefined): AppointmentStatus | undefined =>
  value !== undefined && value in appointmentStatus ? (value as AppointmentStatus) : undefined

export const appointmentStatusChange: Record<AppointmentStatusChange, StatusChangeCopy> = {
  completed: {
    title: "Complete appointment?",
    confirmLabel: "Complete appointment",
    confirmVariant: "default",
    describe: (patientName, serviceName) =>
      `Mark ${patientName}'s ${serviceName} appointment as completed?`
  },
  cancelled: {
    title: "Cancel appointment?",
    confirmLabel: "Cancel appointment",
    confirmVariant: "destructive",
    describe: (patientName, serviceName) =>
      `Cancel ${patientName}'s ${serviceName} appointment? Booking history is retained, but this can't be undone from here.`
  },
  no_show: {
    title: "Mark as no-show?",
    confirmLabel: "Mark no-show",
    confirmVariant: "secondary",
    describe: (patientName, serviceName) =>
      `Mark ${patientName}'s ${serviceName} appointment as no-show?`
  }
}
