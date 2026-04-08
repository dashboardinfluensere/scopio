import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-6 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden flex-col justify-between bg-[#0F172A] p-10 text-white lg:flex">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FFB39C]">
                Scopio
              </p>
              <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight">
                Opprett konto og kom i gang med ditt eget Scopio-workspace.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#CBD5E1]">
                Registrer deg for å samle kontoer, følge utvikling og bygge et
                ryddig analytics-oppsett fra start.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-[#E2E8F0]">
                Etter registrering blir brukeren koblet til et workspace i
                systemet ditt automatisk.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-10">
            <SignUp
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
              forceRedirectUrl="/"
              fallbackRedirectUrl="/"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "w-full max-w-md shadow-none border-0 bg-transparent",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton:
                    "h-11 rounded-xl border border-[#E5E7EB] bg-white text-[#0F172A] font-medium hover:bg-[#F8FAFC]",
                  socialButtonsBlockButtonText: "text-[#0F172A] font-medium",
                  dividerLine: "bg-[#E5E7EB]",
                  dividerText: "text-[#94A3B8] text-xs font-medium",
                  formFieldLabel:
                    "text-[#0F172A] text-sm font-medium mb-2",
                  formFieldInput:
                    "h-11 rounded-xl border border-[#E5E7EB] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#FF6A3D] focus:ring-0",
                  footerActionLink:
                    "text-[#FF6A3D] hover:text-[#FF5A2A] font-semibold",
                  formButtonPrimary:
                    "h-11 rounded-xl bg-[#FF6A3D] text-white font-semibold hover:bg-[#FF5A2A] shadow-none",
                  identityPreviewText: "text-[#475569]",
                  formResendCodeLink:
                    "text-[#FF6A3D] hover:text-[#FF5A2A]",
                  otpCodeFieldInput:
                    "h-11 w-11 rounded-xl border border-[#E5E7EB]",
                  alertText: "text-sm",
                  formFieldSuccessText: "text-[#16A34A]",
                  formFieldErrorText: "text-[#DC2626]",
                  footer: "hidden",
                },
                layout: {
                  socialButtonsPlacement: "top",
                  socialButtonsVariant: "blockButton",
                },
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}