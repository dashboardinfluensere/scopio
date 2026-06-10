import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AccountTabs from "../../components/AccountTabs";
import AppThemeShell from "../../components/AppThemeShell";
import { getServerApiUrl } from "../../lib/api";

type SubscriptionInfo = {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

type OrganizationItem = {
  membershipId: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    createdAt: string;
    updatedAt: string;
    memberCount: number;
    memberLimit: number;
    subscription: SubscriptionInfo;
  };
  isActive: boolean;
};

type OrganizationsResponse = {
  ok: boolean;
  activeOrganizationId: string | null;
  organizations: OrganizationItem[];
};

const API_URL = getServerApiUrl();

async function getAuthHeaders() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("Fant ikke auth-token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getOrganizations(): Promise<OrganizationsResponse> {
  try {
    const headers = await getAuthHeaders();

    const res = await fetch(`${API_URL}/organizations`, {
      cache: "no-store",
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("GET /organizations feilet i account layout:", res.status, text);
      return {
        ok: false,
        activeOrganizationId: null,
        organizations: [],
      };
    }

    return res.json();
  } catch (error) {
    console.error("Kunne ikke hente workspaces i account layout:", error);
    return {
      ok: false,
      activeOrganizationId: null,
      organizations: [],
    };
  }
}

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const organizationsResponse = await getOrganizations();

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
              <AccountTabs
                organizations={organizationsResponse.organizations ?? []}
                activeOrganizationId={organizationsResponse.activeOrganizationId}
              />
              {children}
            </div>
          </section>
        </div>
      </main>
    </AppThemeShell>
  );
}
