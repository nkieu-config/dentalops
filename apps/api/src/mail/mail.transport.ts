import { Logger } from "@nestjs/common"
import { createTransport, type Transporter } from "nodemailer"

export const MAIL_TRANSPORT = "MAIL_TRANSPORT"

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>
}

export class LogTransport implements MailTransport {
  private readonly logger = new Logger("MailTransport")

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      JSON.stringify({ transport: "log", to: message.to, subject: message.subject })
    )
    return Promise.resolve()
  }
}

export class SmtpTransport implements MailTransport {
  private readonly transporter: Transporter

  constructor(
    url: string,
    private readonly from: string
  ) {
    this.transporter = createTransport(url)
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  }
}

export const DEFAULT_MAIL_FROM = "DentalOps <bookings@dentalops.local>"

export const createMailTransport = (): MailTransport => {
  const url = process.env.SMTP_URL
  if (!url) return new LogTransport()
  return new SmtpTransport(url, process.env.MAIL_FROM ?? DEFAULT_MAIL_FROM)
}
