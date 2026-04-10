import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApiUrl } from "../../lib/api";
import RequestAccessForm from "./RequestAccessForm";
import RequestAccessBackButton from "./RequestAccessBackButton";

const API_URL = getServerApiUrl();

type ViewerResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: string | null;
    authProviderId: string | null;
    activeOrganizationId: string | null;
  };
  access?: {
    hasAccess?: boolean;
    requiresOnboarding?: boolean;
    requiresUpgrade?: boolean;
    requiresAccessRequest?: boolean;
  };
  accessRequest?: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
    createdAt: string;
    updatedAt: string;
  } | null;
};

async function getViewer() {
  const authData = await auth();
  const token = await authData.getToken();

  const res = await fetch(`${API_URL}/me`, {
    cache: "no-store",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  if (!res.ok) {
    throw new Error(`Kunbe ikke hente brukerdata. Status: ${res.status}`);
  }

  return res.json() as Promise<ViewerResponse>;
}

export default async function RequestAccessPage() {
  const authData = await auth();

  if (!authData.userId) {
    redirect("/sign-up");
  }

  let viewer: ViewerResponse | null = null;

  try {
    viewer = await getViewer();
  } catch {
    viewer = null;
  }

  if (viewer?.access?.hasAccess) {
    redirect("/dashboard");
  }

  if (viewer?.access?.requiresOnboarding || viewer?.access?.requiresUpgrade) {
    redirect("/plans");
  }

  const email = viewer?.user?.email ?? "";
  const requestStatus = viewer?.accessRequest?.status ?? null;

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-6 py-10 text-[#0F172A] lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-sm font-semibold text-[#0F172A]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF6A3D] text-sm font-bold text-white shadow-sm">
              S
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">Scopio</p>
              <p className="text-xs text-[#64748B]">
                Analytics for creators and teams
              </p>
            </div>
          </Link>

          <RequestAccessBackButton />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-8 shadow-sm lg:p-10">
            <div className="inline-flex items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-4 py-2 text-sm font-medium text-[#C2410C]">
              Tilgangsstyrt oppstart
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight lg:text-5xl">
              Be om tilgang til Scopio
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-[#475569]">
              Du er logget inn, men har ikke tilgang til et workspace ennå. Send
              inn en kort forespørsel først. Hvis den blir godkjent, går du
              videre til planvalg og opprettelse av workspace.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: "1",
                  text: "Du sender inn en kort forespørsel",
                },
                {
                  title: "2",
                  text: "Admin vurderer forespørselen",
                },
                {
                  title: "3",
                  text: "Ved godkjenning går du videre til plan og workspace",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[#E5E7EB] bg-[#FCFDFE] p-5"
                >
                  <p className="text-2xl font-semibold text-[#FF6A3D]">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#64748B]">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-[24px] bg-[#0F172A] p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FFB39C]">
                Hva skjer etterpå?
              </p>
              <p className="mt-4 text-sm leading-7 text-[#CBD5E1]">
                Når forespørselen er godkjent, kan du velge plan, skrive inn nytt
                workspace-navn og komme i gang med onboarding.
              </p>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-8 shadow-sm lg:p-10">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FF6A3D]">
                Forespørsel
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Send inn tilgangsforespørsel
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#64748B]">
                Her sender du bare inn en kort kommentar. E-posten hentes fra
                kontoen du er logget inn med.
              </p>
            </div>

            <RequestAccessForm
              defaultEmail={email}
              requestStatus={requestStatus}
            />
          </section>
        </div>
      </div>
    </main>
  );
}