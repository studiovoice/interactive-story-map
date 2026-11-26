"use client"

import { ArrowLeftIcon, LoaderCircleIcon, LogOutIcon, MailIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient, signOut, useSession } from "@/lib/auth/client"

/** Only same-site paths, so ?next= can't send people to another site after signing in. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/"
}

/**
 * Staff sign-in: email → a one-time code by email → signed in. There's no sign-up; codes are
 * only sent to addresses with an account, and the form says the same thing either way.
 */
export function SignInForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))
  const { data: session, isPending: sessionPending } = useSession()

  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" })
    setBusy(false)
    if (error) return setError(error.message ?? "Couldn't send a code. Try again in a minute.")
    setCode("")
    setStep("code")
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() })
    if (error) {
      setBusy(false)
      return setError(error.message ?? "That code didn't work.")
    }
    router.replace(next)
    router.refresh()
  }

  if (session && !sessionPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re signed in</CardTitle>
          <CardDescription>As {session.user.email}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={next}>Continue</Link>
          </Button>
          <Button variant="outline" onClick={() => signOut()}>
            <LogOutIcon /> Sign out
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {step === "email"
            ? "For staff (admins and curators). We'll email you a one-time code."
            : `If ${email.trim()} has an account, a code is on its way. It works once and expires in 10 minutes.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FieldError>{error}</FieldError>
            </Field>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <MailIcon />} Email me a code
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="code">Code</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="font-mono text-lg tracking-[0.4em]"
              />
              <FieldError>{error}</FieldError>
              <FieldDescription>Didn&apos;t get it? Check spam, or send a new one.</FieldDescription>
            </Field>
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy && <LoaderCircleIcon className="animate-spin" />} Sign in
            </Button>
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("email")
                  setError(null)
                }}
              >
                <ArrowLeftIcon /> Different email
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => sendCode()}>
                Send a new code
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
