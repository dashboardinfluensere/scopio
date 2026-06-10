"use client";

import { useMemo, useState } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthedFetch } from "../hooks/useAuthedFetch";

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

type ProfileFormProps = {
  initialName: string;
  email: string;
  initialOrganizations: OrganizationItem[];
  initialActiveOrganizationId: string | null;
};

type SelectedPlanValue = "pro-trial" | "pro" | "business";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function splitName(fullName: string) {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = trimmed.split(/\s+/);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function isValidSelectedPlan(value: string | null): value is SelectedPlanValue {
  return value === "pro-trial" || value === "pro" || value === "business";
}

function getSelectedPlanLabel(plan: SelectedPlanValue) {
  if (plan === "business") return "Business";
  if (plan === "pro") return "Pro";
  return "Free Trial";
}

export default function ProfileForm({
  initialName,
  email,
  initialOrganizations,
  initialActiveOrganizationId,
}: ProfileFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authedFetch = useAuthedFetch();
  const initialParts = useMemo(() => splitName(initialName), [initialName]);

  const onboardingParam = searchParams.get("onboarding");
  const planParam = searchParams.get("plan");
  const onboardingSelectedPlan: SelectedPlanValue = isValidSelectedPlan(planParam)
    ? planParam
    : "pro-trial";
  const isOnboardingWorkspaceFlow = onboardingParam === "1";

  const [firstName, setFirstName] = useState(initialParts.firstName);
  const [lastName, setLastName] = useState(initialParts.lastName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [organizations, setOrganizations] =
    useState<OrganizationItem[]>(initialOrganizations);
  const [activeOrganizationId, setActiveOrganizationId] = useState(
    initialActiveOrganizationId
  );

  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSuccess, setWorkspaceSuccess] = useState("");

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspacePassword, setNewWorkspacePassword] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joinWorkspacePassword, setJoinWorkspacePassword] = useState("");
  const [joiningWorkspace, setJoiningWorkspace] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(isOnboardingWorkspaceFlow);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  const activeWorkspace = organizations.find(
    (item) => item.organization.id === activeOrganizationId
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

    if (!name) {
      setError("Fornavn eller fullt navn må fylles inn.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await authedFetch(`${API_URL}/me/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunne ikke oppdatere brukeren.");
        return;
      }

      setSuccessMessage("Kontoen din er oppdatert.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da kontoen skulle oppdateres."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError("");
    setWorkspaceSuccess("");

    const trimmedName = newWorkspaceName.trim();
    const trimmedPassword = newWorkspacePassword.trim();

    if (!trimmedName) {
      setWorkspaceError("Skriv inn navn på workspace.");
      return;
    }

    if (trimmedPassword.length < 4) {
      setWorkspaceError("Passord må være minst 4 tegn.");
      return;
    }

    try {
      setCreatingWorkspace(true);

      const response = await authedFetch(`${API_URL}/organizations`, {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          password: trimmedPassword,
          selectedPlan: onboardingSelectedPlan,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke opprette workspace.");
        return;
      }

      const newOrgId = data.organization.id as string;

      const newItem: OrganizationItem = {
        membershipId: data.membership.id,
        role: data.membership.role,
        organization: data.organization,
        isActive: true,
      };

      setOrganizations((prev) => [
        ...prev.map((item) => ({ ...item, isActive: false })),
        newItem,
      ]);
      setActiveOrganizationId(newOrgId);
      setNewWorkspaceName("");
      setNewWorkspacePassword("");
      setWorkspaceSuccess("Workspace opprettet.");

      if (isOnboardingWorkspaceFlow) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace skulle opprettes."
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function handleJoinWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError("");
    setWorkspaceSuccess("");

    const trimmedWorkspaceId = joinWorkspaceId.trim();
    const trimmedPassword = joinWorkspacePassword.trim();

    if (!trimmedWorkspaceId) {
      setWorkspaceError("Skriv inn workspace-ID.");
      return;
    }

    if (!trimmedPassword) {
      setWorkspaceError("Skriv inn workspace-passord.");
      return;
    }

    try {
      setJoiningWorkspace(true);

      const response = await authedFetch(`${API_URL}/organizations/join`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: trimmedWorkspaceId,
          password: trimmedPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke bli med i workspace.");
        return;
      }

      const joinedItem: OrganizationItem = {
        membershipId: data.membership.id,
        role: data.membership.role,
        organization: data.organization,
        isActive: true,
      };

      setOrganizations((prev) => [
        ...prev
          .filter((item) => item.organization.id !== data.organization.id)
          .map((item) => ({ ...item, isActive: false })),
        joinedItem,
      ]);

      setActiveOrganizationId(data.organization.id);
      setJoinWorkspaceId("");
      setJoinWorkspacePassword("");
      setWorkspaceSuccess("Du ble med i workspace.");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da du skulle bli med i workspace."
      );
    } finally {
      setJoiningWorkspace(false);
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
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Min konto
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Oppdater navnet ditt i systemet. E-post vises her som referanse.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label
            className="flex flex-col gap-2 text-sm"
            style={{ color: "var(--color-text)" }}
          >
            <span className="font-medium">Fornavn</span>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="rounded-xl border px-4 py-3 outline-none transition"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            />
          </label>

          <label
            className="flex flex-col gap-2 text-sm"
            style={{ color: "var(--color-text)" }}
          >
            <span className="font-medium">Etternavn</span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="rounded-xl border px-4 py-3 outline-none transition"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            />
          </label>

          <label
            className="md:col-span-2 flex flex-col gap-2 text-sm"
            style={{ color: "var(--color-text)" }}
          >
            <span className="font-medium">E-post</span>
            <input
              value={email}
              disabled
              className="rounded-xl border px-4 py-3 outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-soft)",
                color: "var(--color-muted)",
              }}
            />
          </label>

          {error ? (
            <div
              className="md:col-span-2 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-danger-bg)",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
              }}
            >
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div
              className="md:col-span-2 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-success-bg)",
                backgroundColor: "var(--color-success-bg)",
                color: "var(--color-success-text)",
              }}
            >
              {successMessage}
            </div>
          ) : null}

          <div className="md:col-span-2 flex justify-start">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {submitting ? "Lagrer..." : "Lagre endringer"}
            </button>
          </div>
        </form>
      </section>

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
            Workspace-tilgang
          </h3>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Opprett et nytt workspace eller bli med i et eksisterende.
          </p>
        </div>

        {activeWorkspace ? (
          <div
            className="mt-6 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
              color: "var(--color-text-soft)",
            }}
          >
            Aktiv workspace: {" "}
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              {activeWorkspace.organization.name}
            </span>
          </div>
        ) : null}

        {isOnboardingWorkspaceFlow ? (
          <div
            className="mt-6 rounded-xl border p-4"
            style={{
              borderColor: "rgba(255, 106, 61, 0.22)",
              backgroundColor: "rgba(255, 106, 61, 0.08)",
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              Onboarding
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-soft)" }}>
              Du er i ferd med å opprette et nytt workspace med planen {" "}
              <span style={{ color: "var(--color-text)", fontWeight: 700 }}>
                {getSelectedPlanLabel(onboardingSelectedPlan)}
              </span>
              .
            </p>
          </div>
        ) : null}

        <div
          className="mt-6 rounded-xl border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => setIsCreateOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg bg-transparent px-2 py-1 text-left transition"
            style={{ color: "var(--color-text)" }}
          >
            <h4 className="text-base font-semibold">Opprett nytt workspace</h4>
            <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
              {isCreateOpen ? "Skjul" : "Vis"}
            </span>
          </button>

          {isCreateOpen ? (
            <form onSubmit={handleCreateWorkspace} className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                  <span className="font-medium">Navn</span>
                  <input
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    placeholder="F.eks. Dmytro Agency"
                    className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                  <span className="font-medium">Workspace-passord</span>
                  <input
                    type="password"
                    value={newWorkspacePassword}
                    onChange={(event) => setNewWorkspacePassword(event.target.value)}
                    placeholder="Minst 4 tegn"
                    className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                </label>
              </div>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={creatingWorkspace}
                  className="inline-flex h-[50px] items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {creatingWorkspace ? "Oppretter..." : "Opprett workspace"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div
          className="mt-6 rounded-xl border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => setIsJoinOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg bg-transparent px-2 py-1 text-left transition"
            style={{ color: "var(--color-text)" }}
          >
            <h4 className="text-base font-semibold">Bli med i workspace</h4>
            <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
              {isJoinOpen ? "Skjul" : "Vis"}
            </span>
          </button>

          {isJoinOpen ? (
            <form onSubmit={handleJoinWorkspace} className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                  <span className="font-medium">Workspace-ID</span>
                  <input
                    value={joinWorkspaceId}
                    onChange={(event) => setJoinWorkspaceId(event.target.value)}
                    placeholder="Lim inn workspace-ID"
                    className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                  <span className="font-medium">Workspace-passord</span>
                  <input
                    type="password"
                    value={joinWorkspacePassword}
                    onChange={(event) => setJoinWorkspacePassword(event.target.value)}
                    placeholder="Skriv inn passord"
                    className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                </label>
              </div>

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={joiningWorkspace}
                  className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                >
                  {joiningWorkspace ? "Blir med..." : "Bli med i workspace"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {workspaceError ? (
          <div
            className="mt-4 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--color-danger-bg)",
              backgroundColor: "var(--color-danger-bg)",
              color: "var(--color-danger-text)",
            }}
          >
            {workspaceError}
          </div>
        ) : null}

        {workspaceSuccess ? (
          <div
            className="mt-4 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--color-success-bg)",
              backgroundColor: "var(--color-success-bg)",
              color: "var(--color-success-text)",
            }}
          >
            {workspaceSuccess}
          </div>
        ) : null}
      </section>

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
            Session
          </h3>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Logg ut av Scopio på denne enheten.
          </p>
        </div>

        <div className="mt-5">
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition hover:opacity-80"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              Logg ut
            </button>
          </SignOutButton>
        </div>
      </section>
    </div>
  );
}
