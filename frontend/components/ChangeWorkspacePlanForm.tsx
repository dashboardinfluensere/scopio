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
  price: string;
  description: string;
  accountLimit: number;
  memberLimit: number;
  bullets: string[];
}> = [
  {
    key: "pro",
    name: "Pro",
    price: "149 kr/mnd",
    description: "For creators og små team som vil ha mer historikk.",
    accountLimit: 2,
    memberLimit: 2,
    bullets: [
      "2 kontoer",
      "2 medlemmer totalt",
      "Starter med 90 dagers historikk",
      "Daglig sync av siste 7 dager",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "349 kr/mnd",
    description: "For team og byråer som trenger mer kapasitet.",
    accountLimit: 4,
    memberLimit: 10,
    bullets: [
      "4 kontoer",
      "10 medlemmer totalt",
      "Starter med 90 dagers historikk",
      "Daglig sync av siste 7 dager",
    ],
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

  if (key === "business") return "Business";
  if (key === "pro") return "Pro";
  if (key === "trial") return "Free Trial";

  return "Ukjent plan";
}

function getPlanActionLabel(planKey: PlanKey, currentPlanKey: PlanKey | "trial" | "unknown") {
  if (planKey === currentPlanKey) return "Nåværende plan";

  if (currentPlanKey === "business" && planKey === "pro") {
    return "Nedgrader til Pro";
  }

  if (planKey === "business") {
    return "Oppgrader til Business";
  }

  return "Endre til Pro";
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
      setError("Kun owner kan endre plan for workspace.");
      return;
    }

    if (!selectedPlan) {
      setError("Velg en plan først.");
      return;
    }

    if (selectedPlan === currentPlanKey) {
      setError("Dette workspacet er allerede på denne planen.");
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
        setError(data.error || "Kunne ikke endre plan.");
        setErrorCode(data.code || "");
        return;
      }

      setSuccess(data.message || "Planen er endret.");
      router.push("/account/workspace-settings");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da planen skulle endres."
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
            Workspace-plan
          </p>
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Endre plan
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Du endrer planen for workspace-et under. Free Trial kan ikke velges her.
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
              Nåværende plan
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
              Velg ny plan
            </h3>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Hvis du nedgraderer, må workspacet være innenfor grensene til planen du velger.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {availablePlans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const isSelected = plan.key === selectedPlan;
              const wouldExceedAccounts = activeAccountsCount > plan.accountLimit;
              const wouldExceedMembers = activeWorkspace.organization.memberCount > plan.memberLimit;
              const hasLimitWarning = !isCurrent && (wouldExceedAccounts || wouldExceedMembers);

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
                        className="text-xs font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {plan.name}
                      </p>
                      <p
                        className="mt-4 text-2xl font-semibold"
                        style={{ color: "var(--color-text)" }}
                      >
                        {plan.price}
                      </p>
                      <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
                        {plan.description}
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

                  <div
                    className="my-5 h-px w-full"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />

                  <div className="grid gap-3">
                    {plan.bullets.map((bullet) => (
                      <p key={bullet} className="text-sm" style={{ color: "var(--color-text-soft)" }}>
                        {bullet}
                      </p>
                    ))}
                  </div>

                  {hasLimitWarning ? (
                    <div
                      className="mt-5 rounded-xl border px-4 py-3 text-sm"
                      style={{
                        borderColor: "rgba(255, 106, 61, 0.25)",
                        backgroundColor: "rgba(255, 106, 61, 0.08)",
                        color: "var(--color-text-soft)",
                      }}
                    >
                      {wouldExceedAccounts ? (
                        <p>
                          Dette workspacet har {activeAccountsCount} aktive kontoer. {plan.name} tillater maks {plan.accountLimit}.
                        </p>
                      ) : null}
                      {wouldExceedMembers ? (
                        <p className={wouldExceedAccounts ? "mt-2" : ""}>
                          Dette workspacet har {activeWorkspace.organization.memberCount} medlemmer. {plan.name} tillater maks {plan.memberLimit}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
              Kun owner kan endre plan for workspace.
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
                  : "Endre plan"}
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
