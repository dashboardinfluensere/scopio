import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OnboardingPlansClient from "../../components/OnboardingPlansClient";
import { getServerApiUrl } from "../../lib/api";

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
    upgradeReason?:
      | "trial_expired"
      | "missing_subscription"
      | "inactive_subscription"
      | null;
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

export default async function PlansPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const viewer = await getViewer();

  if (viewer.access?.requiresAccessRequest) {
    redirect("/request-access");
  }

  if (viewer.access?.hasAccess && !viewer.access?.requiresUpgrade) {
    redirect("/dashboard");
  }

  const isOnboardingMode = Boolean(viewer.access?.requiresOnboarding);

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-8 text-[#0F172A] md:px-6">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-8 rounded-[32px] border border-[#E5E7EB] bg-white p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)] md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-4 py-2 text-sm font-medium text-[#C2410C]">
                {isOnboardingMode ? "Godkjent – neste steg" : "Gratisperioden er over"}
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight lg:text-6xl">
                {isOnboardingMode ? "Velg plan" : "Gratisperioden din er utløpt"}
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-8 text-[#475569]">
                {isOnboardingMode
                  ? "Velg planen du vil starte med."
                  : "Oppgrader og få 3x så mye datagrunnlag i starten."}
              </p>
            </div>

            <div className="md:flex md:justify-end">
              <OnboardingPlansClient
                mode={isOnboardingMode ? "onboarding" : "upgrade"}
                upgradeReason={viewer.access?.upgradeReason ?? null}
                renderJoinOnly
              />
            </div>
          </div>
        </header>

        <OnboardingPlansClient
          mode={isOnboardingMode ? "onboarding" : "upgrade"}
          upgradeReason={viewer.access?.upgradeReason ?? null}
        />
      </div>
    </main>
  );
}