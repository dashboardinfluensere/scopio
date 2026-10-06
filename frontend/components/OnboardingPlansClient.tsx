"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthedFetch } from "../hooks/useAuthedFetch";

type PlanKey = "pro-trial" | "pro" | "business";

type Props = {
  mode?: "onboarding" | "upgrade";
  upgradeReason?:
    | "trial_expired"
    | "missing_subscription"
    | "inactive_subscription"
    | null;
  renderJoinOnly?: boolean;
};

type PlanMeta = {
  key: PlanKey;
  name: string;
  accountCount: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const plans: PlanMeta[] = [
  {
    key: "pro-trial",
    name: "Test-scrape",
    accountCount: 1,
  },
  {
    key: "pro",
    name: "Liten scrape",
    accountCount: 2,
  },
  {
    key: "business",
    name: "Stor scrape",
    accountCount: 4,
  },
];

function getPlanBackendPayload(plan: PlanKey) {
  if (plan === "business") {
    return { selectedPlan: "business" as const };
  }

  if (plan === "pro") {
    return { selectedPlan: "pro" as const };
  }

  return { selectedPlan: "pro-trial" as const };
}

export default function OnboardingPlansClient({
  mode = "onboarding",
  renderJoinOnly = false,
}: Props) {
  const router = useRouter();
  const authedFetch = useAuthedFetch();

  const defaultPlan: PlanKey = mode === "upgrade" ? "pro" : "pro-trial";
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(defaultPlan);

  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPanelOpen, setJoinPanelOpen] = useState(false);

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePassword, setWorkspacePassword] = useState("");

  const [joinLoading, setJoinLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [createWorkspaceLoading, setCreateWorkspaceLoading] = useState(false);

  const [joinError, setJoinError] = useState("");
  const [upgradeError, setUpgradeError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  const selectedPlanMeta = getPlanBackendPayload(selectedPlan);

  const visiblePlans = useMemo(() => {
    if (mode === "upgrade") {
      return plans.filter((plan) => plan.key !== "pro-trial");
    }

    return plans;
  }, [mode]);

  const selectedPlanCard = useMemo(
    () => plans.find((plan) => plan.key === selectedPlan) ?? plans[0],
    [selectedPlan]
  );

  async function handleUpgradeActiveWorkspace() {
    setUpgradeError("");
    setUpgradeLoading(true);

    try {
      const res = await authedFetch(`${API_URL}/organizations/upgrade-active`, {
        method: "POST",
        body: JSON.stringify({
          selectedPlan: selectedPlanMeta.selectedPlan,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke endre scrape-oppsett.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : "Noe gikk galt");
    } finally {
      setUpgradeLoading(false);
    }
  }

  function openWorkspaceModal() {
    setUpgradeError("");
    setWorkspaceError("");
    setWorkspaceModalOpen(true);
  }

  function closeWorkspaceModal() {
    if (createWorkspaceLoading) return;
    setWorkspaceModalOpen(false);
    setWorkspaceError("");
  }

  async function handleCreateWorkspace() {
    setWorkspaceError("");
    setUpgradeError("");

    const trimmedName = workspaceName.trim();
    const trimmedPassword = workspacePassword.trim();

    if (!trimmedName) {
      setWorkspaceError("Skriv inn navn på workspace.");
      return;
    }

    if (trimmedPassword.length < 4) {
      setWorkspaceError("Passord må være minst 4 tegn.");
      return;
    }

    setCreateWorkspaceLoading(true);

    try {
      const res = await authedFetch(`${API_URL}/organizations`, {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          password: trimmedPassword,
          selectedPlan: selectedPlanMeta.selectedPlan,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke opprette workspace");
      }

      setWorkspaceModalOpen(false);
      setWorkspaceName("");
      setWorkspacePassword("");

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Noe gikk galt");
    } finally {
      setCreateWorkspaceLoading(false);
    }
  }

  async function handlePrimaryAction() {
    if (mode === "upgrade") {
      await handleUpgradeActiveWorkspace();
      return;
    }

    openWorkspaceModal();
  }

  async function handleJoinWorkspace() {
    setJoinError("");

    if (!joinWorkspaceId.trim()) {
      setJoinError("Skriv inn workspace-ID.");
      return;
    }

    if (!joinPassword.trim()) {
      setJoinError("Skriv inn workspace-passord.");
      return;
    }

    setJoinLoading(true);

    try {
      const res = await authedFetch(`${API_URL}/organizations/join`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: joinWorkspaceId.trim(),
          password: joinPassword.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke bli med i workspace");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Noe gikk galt");
    } finally {
      setJoinLoading(false);
    }
  }

  if (renderJoinOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => setJoinPanelOpen(true)}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-5 text-sm font-medium text-[#475569] transition hover:border-[#D6D9DF] hover:bg-white hover:text-[#0F172A]"
        >
          Bli med i eksisterende workspace
        </button>

        {joinPanelOpen ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 py-6 backdrop-blur-[2px]">
            <div className="w-full max-w-lg rounded-[32px] border border-[#E5E7EB] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.20)] md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                    Bli med i workspace
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[#64748B]">
                    Har du fått workspace-ID og passord fra owner? Bruk det her.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setJoinPanelOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#344054] transition hover:bg-[#F8FAFC]"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                    Workspace-ID
                  </span>
                  <input
                    type="text"
                    value={joinWorkspaceId}
                    onChange={(e) => setJoinWorkspaceId(e.target.value)}
                    placeholder="F.eks. cmabc123..."
                    className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#FF6A3D]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                    Workspace-passord
                  </span>
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="Skriv inn passord"
                    className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#FF6A3D]"
                  />
                </label>
              </div>

              {joinError ? (
                <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                  {joinError}
                </div>
              ) : null}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setJoinPanelOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#D0D5DD] bg-white px-5 text-sm font-semibold text-[#344054] transition hover:bg-[#F8FAFC]"
                >
                  Avbryt
                </button>

                <button
                  type="button"
                  onClick={handleJoinWorkspace}
                  disabled={joinLoading}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0F172A] px-5 text-sm font-semibold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {joinLoading ? "Blir med..." : "Bli med"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="grid gap-8">
        <section className="flex justify-center">
          <div
            className={[
              "grid w-full gap-8 lg:gap-10",
              mode === "upgrade"
                ? "max-w-4xl lg:grid-cols-2"
                : "max-w-6xl lg:grid-cols-3",
            ].join(" ")}
          >
            {visiblePlans.map((plan) => {
              const active = selectedPlan === plan.key;

              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={[
                    "w-full rounded-[32px] border bg-white p-8 text-left shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition",
                    active
                      ? "border-[#FF6A3D] ring-2 ring-[#FF6A3D]/15"
                      : "border-[#E5E7EB] hover:-translate-y-0.5 hover:border-[#D6D9DF] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                          {plan.name}
                        </h3>

                      </div>

                    </div>

                    {active ? (
                      <span className="rounded-full bg-[#FFF4EF] px-3 py-1 text-xs font-semibold text-[#FF6A3D]">
                        Valgt
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 text-sm font-medium text-[#64748B]">
                    {plan.accountCount} {plan.accountCount === 1 ? "konto" : "kontoer"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {upgradeError ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {upgradeError}
          </div>
        ) : null}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={upgradeLoading}
            className="inline-flex h-12 min-w-[240px] items-center justify-center rounded-2xl bg-[#FF6A3D] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,61,0.24)] transition hover:-translate-y-0.5 hover:bg-[#FF5A2A] hover:shadow-[0_16px_30px_rgba(255,106,61,0.30)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {upgradeLoading
              ? "Fortsetter..."
                : mode === "upgrade"
                ? `Velg ${selectedPlanCard.name}`
                : `Fortsett med ${selectedPlanCard.name}`}
          </button>
        </div>
      </div>

      {workspaceModalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 py-6 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-[32px] border border-[#E5E7EB] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.20)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#C2410C]">
                  {selectedPlanCard.name}
                </div>

                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[#0F172A]">
                  Opprett workspace
                </h3>

                <p className="mt-2 text-sm leading-7 text-[#64748B]">
                  Velg navn og passord for workspace-et ditt før du går videre.
                </p>
              </div>

              <button
                type="button"
                onClick={closeWorkspaceModal}
                disabled={createWorkspaceLoading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#344054] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                  Navn på workspace
                </span>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="F.eks. Analyse av SoMe"
                  className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#FF6A3D]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                  Workspace-passord
                </span>
                <input
                  type="password"
                  value={workspacePassword}
                  onChange={(e) => setWorkspacePassword(e.target.value)}
                  placeholder="Minst 4 tegn"
                  className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#FF6A3D]"
                />
              </label>
            </div>

            {workspaceError ? (
              <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                {workspaceError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeWorkspaceModal}
                disabled={createWorkspaceLoading}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#D0D5DD] bg-white px-5 text-sm font-semibold text-[#344054] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Avbryt
              </button>

              <button
                type="button"
                onClick={handleCreateWorkspace}
                disabled={createWorkspaceLoading}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#FF6A3D] px-5 text-sm font-semibold text-white transition hover:bg-[#FF5A2A] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {createWorkspaceLoading ? "Fortsetter..." : "Fortsett"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
