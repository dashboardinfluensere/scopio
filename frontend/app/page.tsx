import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApiUrl } from "../lib/api";

const API_URL = getServerApiUrl();

const stats = [
  { value: "1 dashboard", label: "for alle kontoene dine" },
  { value: "Flere workspaces", label: "for team og kunder" },
  { value: "Én oversikt", label: "over ytelse og utvikling" },
];

const features = [
  {
    title: "Samle kontoer på ett sted",
    description:
      "Følg TikTok- og Instagram-kontoer i ett dashboard, uten å hoppe mellom plattformer og manuelle notater.",
  },
  {
    title: "Forstå hva som faktisk fungerer",
    description:
      "Se utvikling, toppinnhold, publiseringsmønstre og nøkkeltall i en struktur som er lett å lese og bruke.",
  },
  {
    title: "Bygd for creators, byråer og team",
    description:
      "Opprett workspaces, hold data adskilt og jobb ryddig enten du følger egne kontoer eller flere profiler samtidig.",
  },
];

const steps = [
  {
    number: "01",
    title: "Opprett konto",
    description:
      "Lag en bruker og kom inn i Scopio-universet på noen sekunder.",
  },
  {
    number: "02",
    title: "Be om tilgang",
    description:
      "Send inn en forespørsel og vent på godkjenning før du går videre.",
  },
  {
    number: "03",
    title: "Velg plan og opprett workspace",
    description:
      "Når du er godkjent, velger du plan, oppretter workspace og kommer i gang.",
  },
];

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
    throw new Error(`Kunne ikke hente brukerdata. Status: ${res.status}`);
  }

  return res.json() as Promise<ViewerResponse>;
}

function resolveAccessRedirect(viewer: ViewerResponse) {
  if (viewer.access?.hasAccess) {
    return "/dashboard";
  }

  if (viewer.access?.requiresOnboarding) {
    return "/plans";
  }

  if (viewer.access?.requiresUpgrade) {
    return "/plans";
  }

  if (viewer.access?.requiresAccessRequest) {
    return "/request-access";
  }

  return "/request-access";
}

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    let viewer: ViewerResponse;

    try {
      viewer = await getViewer();
    } catch (error) {
      console.error("Kunne ikke hente viewer i /:", error);
      redirect("/request-access");
    }

    redirect(resolveAccessRedirect(viewer));
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB]/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF6A3D] text-sm font-bold text-white shadow-sm">
              S
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">Scopio</p>
              <p className="text-xs text-[#64748B]">
                Analytics for creators and teams
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-[#475569] transition hover:text-[#0F172A]"
            >
              Funksjoner
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-[#475569] transition hover:text-[#0F172A]"
            >
              Hvordan det funker
            </a>
            <a
              href="#why-scopio"
              className="text-sm font-medium text-[#475569] transition hover:text-[#0F172A]"
            >
              Hvorfor Scopio
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC]"
            >
              Logg inn
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#FF6A3D] px-5 text-sm font-semibold text-white transition hover:bg-[#FF5A2A]"
            >
              Opprett konto
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,106,61,0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.06),_transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-4 py-2 text-sm font-medium text-[#C2410C]">
              Ny måte å følge innhold og kontoer på
            </div>

            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-tight tracking-tight lg:text-6xl">
              Ett dashboard for{" "}
              <span className="text-[#FF6A3D]">vekst, ytelse og innhold</span>{" "}
              på tvers av kontoer.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#475569]">
              Scopio er et analytics-dashboard for creators, byråer og team som
              vil samle kontoer, forstå hva som fungerer og få en ryddig oversikt
              over utvikling – uten regneark-kaos og manuelle mellomledd.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#FF6A3D] px-6 text-sm font-semibold text-white transition hover:bg-[#FF5A2A]"
              >
                Opprett konto
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-6 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC]"
              >
                Logg inn
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
                >
                  <p className="text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#64748B]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-2xl rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
              <div className="rounded-[24px] border border-[#EEF2F7] bg-[#FCFDFE] p-5">
                <div className="flex items-center justify-between border-b border-[#EEF2F7] pb-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      Dashboard
                    </p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      Oversikt over ytelse, kontoer og utvikling
                    </p>
                  </div>
                  <div className="rounded-full bg-[#FFF4EF] px-3 py-1 text-xs font-semibold text-[#FF6A3D]">
                    Scopio
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
                      Views
                    </p>
                    <p className="mt-3 text-2xl font-semibold">1.24M</p>
                    <p className="mt-1 text-xs text-[#16A34A]">
                      +14.2% siste periode
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
                      Engagement
                    </p>
                    <p className="mt-3 text-2xl font-semibold">8.7%</p>
                    <p className="mt-1 text-xs text-[#16A34A]">Stabil vekst</p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
                      Kontoer
                    </p>
                    <p className="mt-3 text-2xl font-semibold">6</p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      TikTok + Instagram
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Utvikling</p>
                      <span className="text-xs text-[#64748B]">
                        Siste 30 dager
                      </span>
                    </div>

                    <div className="mt-6 flex h-48 items-end gap-2">
                      {[32, 46, 40, 58, 52, 67, 74, 71, 82, 94, 88, 102].map(
                        (height, index) => (
                          <div
                            key={index}
                            className="flex-1 rounded-t-xl bg-gradient-to-t from-[#FF6A3D] to-[#FF9E7D]"
                            style={{ height: `${height}%` }}
                          />
                        )
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-sm font-semibold">Toppinnhold</p>

                    <div className="mt-4 space-y-3">
                      {[
                        {
                          title: "Sterk hook og høy retention",
                          meta: "TikTok · 182k views",
                        },
                        {
                          title: "Best resultat siste uke",
                          meta: "Instagram · 91k views",
                        },
                        {
                          title: "Høyest engagement rate",
                          meta: "TikTok · 12.4%",
                        },
                      ].map((item) => (
                        <div
                          key={item.title}
                          className="rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] p-3"
                        >
                          <p className="text-sm font-medium text-[#0F172A]">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-[#64748B]">
                            {item.meta}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Tracked accounts</p>
                    <span className="text-xs text-[#64748B]">
                      Workspace: Agency
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { platform: "TikTok", handle: "@creatoralpha" },
                      { platform: "Instagram", handle: "@brandstudio" },
                    ].map((account) => (
                      <div
                        key={account.handle}
                        className="flex items-center justify-between rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{account.handle}</p>
                          <p className="text-xs text-[#64748B]">
                            {account.platform}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#FFF4EF] px-3 py-1 text-[11px] font-semibold text-[#FF6A3D]">
                          Aktiv
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}