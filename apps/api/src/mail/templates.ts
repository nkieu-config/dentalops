import { MailMessage } from "./mail.transport"

export const BKK_TIME_ZONE = "Asia/Bangkok"

const BKK_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BKK_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

export const formatBkk = (date: Date): string => BKK_FORMAT.format(date)

export const manageUrl = (token: string): string =>
  `${(process.env.WEB_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "")}/manage/${token}`

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export interface ConfirmationInput {
  to: string
  clinicName: string
  patientName: string
  serviceName: string
  dentistName: string
  branchName: string
  startsAt: Date
  manageToken: string
}

export const renderConfirmation = (input: ConfirmationInput): MailMessage => {
  const when = formatBkk(input.startsAt)
  const url = manageUrl(input.manageToken)
  const lines = [
    `Hi ${input.patientName},`,
    "",
    `Your appointment at ${input.clinicName} is confirmed.`,
    "",
    `When: ${when} (Bangkok time)`,
    `Service: ${input.serviceName}`,
    `Dentist: ${input.dentistName}`,
    `Branch: ${input.branchName}`,
    "",
    `Need to change or cancel? ${url}`,
    "",
    `See you soon,`,
    input.clinicName
  ]
  const html = [
    `<p>Hi ${escapeHtml(input.patientName)},</p>`,
    `<p>Your appointment at ${escapeHtml(input.clinicName)} is confirmed.</p>`,
    "<ul>",
    `<li><strong>When:</strong> ${escapeHtml(when)} (Bangkok time)</li>`,
    `<li><strong>Service:</strong> ${escapeHtml(input.serviceName)}</li>`,
    `<li><strong>Dentist:</strong> ${escapeHtml(input.dentistName)}</li>`,
    `<li><strong>Branch:</strong> ${escapeHtml(input.branchName)}</li>`,
    "</ul>",
    `<p><a href="${escapeHtml(url)}">Change or cancel your booking</a></p>`,
    `<p>See you soon,<br />${escapeHtml(input.clinicName)}</p>`
  ].join("")

  return {
    to: input.to,
    subject: `Your ${input.clinicName} appointment is confirmed`,
    text: lines.join("\n"),
    html
  }
}
