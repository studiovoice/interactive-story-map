/**
 * Sending email (sign-in codes). Resend when RESEND_API_KEY is set; otherwise, outside
 * production, the message is printed to the server console so local sign-in works without an
 * email account. Not `server-only` so scripts can use it, but never import it from the browser.
 */
import { Resend } from "resend"

export type Email = { to: string; subject: string; text: string; html?: string }

let resend: Resend | null = null

export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set; can't send email.")
    console.info(
      `\n── Email (not sent: RESEND_API_KEY is not set) ──\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`,
    )
    return
  }
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM is not set (e.g. "Story Map <sign-in@auth.example.org>").')
  resend ??= new Resend(key)
  const { error } = await resend.emails.send({
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The sign-in code email. */
export function signInCodeEmail(to: string, code: string, appName: string, minutes: number): Email {
  return {
    to,
    subject: `${code} is your ${appName} sign-in code`,
    text:
      `Your ${appName} sign-in code is ${code}\n\n` +
      `It expires in ${minutes} minutes and works once. If you didn't try to sign in, you can ignore this email.`,
    html:
      `<p>Your ${escapeHtml(appName)} sign-in code is</p>` +
      `<p style="font-size:28px;font-weight:600;letter-spacing:4px;font-family:ui-monospace,monospace">${escapeHtml(code)}</p>` +
      `<p>It expires in ${minutes} minutes and works once. If you didn't try to sign in, you can ignore this email.</p>`,
  }
}
