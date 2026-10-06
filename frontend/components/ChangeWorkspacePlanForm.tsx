"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthedFetch } from "../hooks/useAuthedFetch";

type SubscriptionInfo = {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

type ActiveWorkspace = {
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

type ChangeWorkspacePlanFormProps = {
  activeWorkspace: ActiveWorkspace;
  activeAccountsCount: number;
  activeAccountLimit: number;
};

type PlanKey = "pro" | "business";

type ApiErrorResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  activeAccountsCount?: number;
  activeAccountLimit?: number;
  accountsToRemove?: number;
  memberCount?: number;
  memberLimit?: number;
  membersToRemove?: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PLANS: Array<{
  key: PlanKey;
  name: string;
  accountLimit: number;
}> = [
  {
    key: "pro",
    name: "Liten scrape",
    accountLimit: 2,
  },
  {
    key: "business",
    name: "Stor scrape",
    accountLimit: 4,
  },
];

function getCurrentPlanKey(subscription: SubscriptionInfo): PlanKey | "trial" | "unknown" {
  if (!subscription) return "unknown";

  if (subscription.plan === "BUSINESS") {
    return "business";
  }

  if (subscription.plan === "PRO" && subscription.status === "TRIALING") {
    return "trial";
  }

  if (subscription.plan === "PRO") {
    return "pro";
  }

  return "unknown";
}

function getCurrentPlanName(subscription: SubscriptionInfo) {
  const key = getCurrentPlanKey(subscription);

  if (key === "business") return "Stor scrape";
  if (key === "pro") return "Liten scrape";
  if (key === "trial") return "Test-scrape";

  return "Ukjent oppsett";
}

function getPlanActionLabel(planKey: PlanKey, currentPlanKey: PlanKey | "trial" | "unknown") {
  if (planKey === currentPlanKey) return "Nåværende oppsett";

  if (currentPlanKey === "business" && planKey === "pro") {
    return "Bytt til liten scrape";
  }

  if (planKey === "business") {
    return "Bytt til stor scrape";
  }

  return "Bytt til liten scrape";
}

export default function ChangeWorkspacePlanForm({
  activeWorkspace,
  activeAccountsCount,
}: ChangeWorkspacePlanFormProps) {

  const router = useRouter();
  const authedFetch = useAuthedFetch();

  const currentPlanKey = useMemo(
    () => getCurrentPlanKey(activeWorkspace.organization.subscription),
    [activeWorkspace.organization.subscription]
  );

  const currentPlanName = getCurrentPlanName(activeWorkspace.organization.subscription);
  const currentPlanDetails = PLANS.find((plan) => plan.key === currentPlanKey);

  const availablePlans = PLANS;
  const firstSelectablePlan = availablePlans.find((plan) => plan.key !== currentPlanKey);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | "">(
    firstSelectablePlan?.key ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [success, setSuccess] = useState("");

  const selectedPlanDetails = PLANS.find((plan) => plan.key === selectedPlan);
  const isOwner = activeWorkspace.role === "OWNER";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setErrorCode("");
    setSuccess("");

    if (!isOwner) {
      setError("Kun owner kan endre scrape-oppsett for workspace.");
      return;
    }

    if (!selectedPlan) {
      setError("Velg et scrape-oppsett først.");
      return;
    }

    if (selectedPlan === currentPlanKey) {
      setError("Dette workspacet bruker allerede dette scrape-oppsettet.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await authedFetch(`${API_URL}/organizations/upgrade-active`, {
        method: "POST",
        body: JSON.stringify({
          selectedPlan,
        }),
      });

      const data = (await response.json()) as ApiErrorResponse & {
        message?: string;
      };

      if (!response.ok) {
        setError(data.error || "Kunne ikke endre scrape-oppsett.");
        setErrorCode(data.code || "");
        return;
      }

      setSuccess("Scrape-oppsettet er endret.");
      router.push("/account/workspace-settings");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da scrape-oppsettet skulle endres."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section
        className="rounded-xl border p-6 shadow-sm"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex flex-col gap-2">
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-accent)" }}
          >
            Workspace-oppsett
          </p>
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Endre scrape-oppsett
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Velg hvor stort scrape-oppsett workspace-et skal bruke. Test-scrape kan ikke velges her.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--color-muted)" }}
            >
              Workspace
            </p>
            <p
              className="mt-1 text-base font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {activeWorkspace.organization.name}
            </p>
            <p className="mt-2 break-all text-xs" style={{ color: "var(--color-muted)" }}>
              ID: {activeWorkspace.organization.id}
            </p>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "rgba(255, 106, 61, 0.22)",
              backgroundColor: "rgba(255, 106, 61, 0.08)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--color-accent)" }}
            >
              Nåværende oppsett
            </p>
            <p
              className="mt-1 text-base font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {currentPlanName}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-soft)" }}>
              Kontoer: {activeAccountsCount} / {currentPlanDetails?.accountLimit ?? "?"}
            </p>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--color-muted)" }}
            >
              Medlemmer
            </p>
            <p
              className="mt-1 text-base font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {activeWorkspace.organization.memberCount} / {activeWorkspace.organization.memberLimit}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
              Din rolle: {activeWorkspace.role === "OWNER" ? "Owner" : activeWorkspace.role}
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="grid gap-6">
        <section
          className="rounded-xl border p-6 shadow-sm"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div className="flex flex-col gap-2">
            <h3
              className="text-xl font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Velg nytt scrape-oppsett
            </h3>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Hvis du velger et mindre oppsett, må workspace-et være innenfor grensene som vises.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {availablePlans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const isSelected = plan.key === selectedPlan;

              return (
                <button
                  key={plan.key}
                  type="button"
                  disabled={isCurrent || submitting || !isOwner}
                  onClick={() => setSelectedPlan(plan.key)}
                  className="rounded-xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
                  style={{
                    borderColor: isSelected
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    backgroundColor: isSelected
                      ? "rgba(255, 106, 61, 0.08)"
                      : "var(--color-surface-soft)",
                    boxShadow: isSelected
                      ? "0 0 0 1px rgba(255, 106, 61, 0.25)"
                      : "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className="text-lg font-semibold"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {plan.name}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
                        {plan.accountLimit} {plan.accountLimit === 1 ? "konto" : "kontoer"}
                      </p>
                    </div>

                    {isCurrent ? (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: "rgba(255, 106, 61, 0.12)",
                          color: "var(--color-accent)",
                        }}
                      >
                        Nåværende
                      </span>
                    ) : isSelected ? (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: "rgba(22, 163, 74, 0.12)",
                          color: "var(--color-success-text)",
                        }}
                      >
                        Valgt
                      </span>
                    ) : null}
                  </div>

                </button>
              );
            })}
          </div>

          {!isOwner ? (
            <div
              className="mt-6 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-danger-bg)",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
              }}
            >
              Kun owner kan endre scrape-oppsett for workspace.
            </div>
          ) : null}

          {error ? (
            <div
              className="mt-6 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-danger-bg)",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
              }}
            >
              <p>{error}</p>
              {errorCode === "PLAN_ACCOUNT_LIMIT_EXCEEDED" ? (
                <div className="mt-3">
                  <Link
                    href="/account/tracked-accounts"
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition"
                    style={{
                      borderColor: "rgba(220, 38, 38, 0.35)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-danger-text)",
                    }}
                  >
                    Gå til kontoer du tracker
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {success ? (
            <div
              className="mt-6 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-success-bg)",
                backgroundColor: "var(--color-success-bg)",
                color: "var(--color-success-text)",
              }}
            >
              {success}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!selectedPlan || submitting || !isOwner}
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {submitting
                ? "Endrer..."
                : selectedPlanDetails
                  ? getPlanActionLabel(selectedPlanDetails.key, currentPlanKey)
                  : "Endre scrape-oppsett"}
            </button>

            <Link
              href="/account/workspace-settings"
              className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              Avbryt
            </Link>
          </div>
        </section>
      </form>
    </div>
  );
}
