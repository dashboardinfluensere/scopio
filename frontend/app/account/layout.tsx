import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AccountTabs from "../../components/AccountTabs";
import AppThemeShell from "../../components/AppThemeShell";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <AppThemeShell>
      <main
        className="min-h-screen px-4 py-6 md:px-6"
        style={{
          backgroundColor: "var(--color-bg)",
          color: "var(--color-text)",
        }}
      >
        <div className="fixed right-6 top-6 z-[1001]">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#FF6A3D] focus:ring-offset-2"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
            }}
          >
            Til dashboard
          </Link>
        </div>

        <div className="mx-auto max-w-[1380px]">
          <header className="mb-8 flex items-center justify-between gap-6">
            <div className="flex items-center gap-8">
              <Link href="/" className="block">
                <svg
                  width="150"
                  height="44"
                  viewBox="0 0 260 90"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Scopio logo"
                  className="block"
                >
                  <text
                    x="8"
                    y="68"
                    fill="var(--color-text)"
                    fontSize="64"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    fontWeight="700"
                    letterSpacing="-2"
                  >
                    Scopio
                  </text>
                </svg>
              </Link>

              <div>
                <h1
                  className="text-[32px] font-semibold tracking-tight"
                  style={{ color: "var(--color-text)" }}
                >
                  Konto og innstillinger
                </h1>
              </div>
            </div>
          </header>

          <section
            className="rounded-2xl border p-6 shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <div className="flex flex-col gap-6">
              <AccountTabs />
              {children}
            </div>
          </section>
        </div>
      </main>
    </AppThemeShell>
  );
}