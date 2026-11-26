import type { Metadata } from "next"
import { Suspense } from "react"
import { SignInForm } from "@/components/auth/sign-in-form"
import { PageContainer } from "@/components/page-header"

export const metadata: Metadata = { title: "Sign in", robots: { index: false } }

export default function SignInPage() {
  return (
    <PageContainer className="flex max-w-md flex-1 flex-col justify-center">
      {/* The form reads ?next= (URL data), so it sits behind a boundary. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </PageContainer>
  )
}
