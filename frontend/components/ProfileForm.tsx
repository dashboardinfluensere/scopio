"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SignOutButton,
  useAuth,
  useReverification,
} from "@clerk/nextjs";
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

type WorkspaceMember = {
  membershipId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
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

function formatRole(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

function getDaysLeft(endDate: string | null | undefined) {
  if (!endDate) return null;

  const now = new Date();
  const end = new Date(endDate);

  const diffMs = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

function getPlanName(subscription: SubscriptionInfo) {
  if (!subscription) return "Ukjent plan";

  if (subscription.plan === "BUSINESS") {
    return "Business";
  }

  if (subscription.plan === "PRO" && subscription.status === "TRIALING") {
    return "Pro Trial";
  }

  if (subscription.plan === "PRO") {
    return "Pro";
  }

  if (subscription.plan === "STARTER") {
    return "Starter";
  }

  return "Free";
}

function getPlanDescription(subscription: SubscriptionInfo) {
  if (!subscription) {
    return "Workspace-plan settes opp.";
  }

  if (subscription.status === "TRIALING") {
    const daysLeft = getDaysLeft(subscription.currentPeriodEnd);

    if (typeof daysLeft === "number") {
      return `Prøveperioden er aktiv. ${daysLeft} dag${daysLeft === 1 ? "" : "er"} igjen.`;
    }

    return "Prøveperioden er aktiv.";
  }

  if (subscription.status === "ACTIVE") {
    return "Abonnementet er aktivt.";
  }

  return `Status: ${subscription.status}`;
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
  const { getToken } = useAuth();
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

  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspacePassword, setNewWorkspacePassword] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joinWorkspacePassword, setJoinWorkspacePassword] = useState("");
  const [joiningWorkspace, setJoiningWorkspace] = useState(false);

  const [ownerWorkspaceName, setOwnerWorkspaceName] = useState("");
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);

  const [ownerNewPassword, setOwnerNewPassword] = useState("");
  const [updatingWorkspacePassword, setUpdatingWorkspacePassword] =
    useState(false);

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberActionId, setMemberActionId] = useState("");
  const [memberRoleLoadingId, setMemberRoleLoadingId] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isOwnerOpen, setIsOwnerOpen] = useState(false);

  const [deleteOrganizationId, setDeleteOrganizationId] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  const activeWorkspace = organizations.find(
    (item) => item.organization.id === activeOrganizationId
  );

  const deletableWorkspace = organizations.find(
    (item) => item.organization.id === deleteOrganizationId
  );

  const ownerOrganizations = organizations.filter(
    (item) => item.role === "OWNER"
  );

  const isOwnerOfActiveWorkspace = activeWorkspace?.role === "OWNER";
  const activeSubscription = activeWorkspace?.organization.subscription ?? null;
  const activePlanName = getPlanName(activeSubscription);
  const activePlanDescription = getPlanDescription(activeSubscription);
  const activeMemberCount = activeWorkspace?.organization.memberCount ?? 0;
  const activeMemberLimit = activeWorkspace?.organization.memberLimit ?? 0;
  const isWorkspaceFull =
    activeMemberLimit > 0 && activeMemberCount >= activeMemberLimit;

  const canDeleteWorkspace =
    isOwnerOfActiveWorkspace &&
    !!deleteOrganizationId &&
    deleteConfirmText.trim() === "SLETT" &&
    !deletingWorkspace;

  const deleteWorkspaceWithReverification = useReverification(async () => {
    return fetch(`/api/organizations/${deleteOrganizationId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmationText: "SLETT",
      }),
    });
  });

  useEffect(() => {
    setOwnerWorkspaceName(activeWorkspace?.organization.name ?? "");
  }, [activeWorkspace?.organization.id, activeWorkspace?.organization.name]);

  useEffect(() => {
    if (
      ownerOrganizations.length === 1 &&
      !deleteOrganizationId &&
      isOwnerOfActiveWorkspace
    ) {
      setDeleteOrganizationId(ownerOrganizations[0].organization.id);
    }
  }, [deleteOrganizationId, isOwnerOfActiveWorkspace, ownerOrganizations]);

  useEffect(() => {
    if (isOnboardingWorkspaceFlow) {
      setIsCreateOpen(true);
      setIsJoinOpen(false);
      setIsOwnerOpen(false);
    }
  }, [isOnboardingWorkspaceFlow]);

  useEffect(() => {
    async function loadMembers() {
      if (!activeOrganizationId || !isOwnerOfActiveWorkspace) {
        setMembers([]);
        return;
      }

      try {
        setLoadingMembers(true);
        setWorkspaceError("");

        const token = await getToken();

        if (!token) {
          setWorkspaceError("Ikke autentisert");
          return;
        }

        const response = await fetch(
          `${API_URL}/organizations/${activeOrganizationId}/members`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setWorkspaceError(data.error || "Kunne ikke hente medlemmer.");
          return;
        }

        setMembers(data.members ?? []);

        setOrganizations((prev) =>
          prev.map((item) =>
            item.organization.id === activeOrganizationId
              ? {
                  ...item,
                  organization: {
                    ...item.organization,
                    memberCount:
                      data.memberCount ?? item.organization.memberCount,
                    memberLimit:
                      data.memberLimit ?? item.organization.memberLimit,
                  },
                }
              : item
          )
        );
      } catch {
        setWorkspaceError("Noe gikk galt da medlemmer skulle hentes.");
      } finally {
        setLoadingMembers(false);
      }
    }

    loadMembers();
  }, [activeOrganizationId, getToken, isOwnerOfActiveWorkspace]);

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

  async function handleSetActiveWorkspace(organizationId: string) {
    if (!organizationId || organizationId === activeOrganizationId) {
      return;
    }

    setWorkspaceError("");
    setWorkspaceSuccess("");

    try {
      setSwitchingWorkspace(true);

      const response = await authedFetch(`${API_URL}/organizations/set-active`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke bytte workspace.");
        return;
      }

      setActiveOrganizationId(organizationId);
      setOrganizations((prev) =>
        prev.map((item) => ({
          ...item,
          isActive: item.organization.id === organizationId,
        }))
      );
      setWorkspaceSuccess("Workspace oppdatert.");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace skulle byttes."
      );
    } finally {
      setSwitchingWorkspace(false);
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
      setOwnerNewPassword("");
      setDeleteOrganizationId("");
      setDeleteConfirmText("");
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

  async function handleRenameWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError("");
    setWorkspaceSuccess("");

    if (!activeOrganizationId) {
      setWorkspaceError("Ingen aktiv workspace valgt.");
      return;
    }

    const trimmedName = ownerWorkspaceName.trim();

    if (!trimmedName) {
      setWorkspaceError("Skriv inn et navn på workspace.");
      return;
    }

    try {
      setRenamingWorkspace(true);

      const response = await authedFetch(
        `${API_URL}/organizations/${activeOrganizationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: trimmedName,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke endre navn på workspace.");
        return;
      }

      setOrganizations((prev) =>
        prev.map((item) =>
          item.organization.id === activeOrganizationId
            ? {
                ...item,
                organization: data.organization,
              }
            : item
        )
      );

      setWorkspaceSuccess("Workspace-navn oppdatert.");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace-navnet skulle oppdateres."
      );
    } finally {
      setRenamingWorkspace(false);
    }
  }

  async function handleUpdateWorkspacePassword(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setWorkspaceError("");
    setWorkspaceSuccess("");

    if (!activeOrganizationId) {
      setWorkspaceError("Ingen aktiv workspace valgt.");
      return;
    }

    const trimmedPassword = ownerNewPassword.trim();

    if (trimmedPassword.length < 4) {
      setWorkspaceError("Passord må være minst 4 tegn.");
      return;
    }

    try {
      setUpdatingWorkspacePassword(true);

      const response = await authedFetch(
        `${API_URL}/organizations/${activeOrganizationId}/password`,
        {
          method: "PATCH",
          body: JSON.stringify({
            password: trimmedPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(
          data.error || "Kunne ikke oppdatere workspace-passord."
        );
        return;
      }

      setOwnerNewPassword("");
      setWorkspaceSuccess("Workspace-passord oppdatert.");
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace-passordet skulle oppdateres."
      );
    } finally {
      setUpdatingWorkspacePassword(false);
    }
  }

  async function handleRoleChange(
    membershipId: string,
    role: "ADMIN" | "MEMBER"
  ) {
    if (!activeOrganizationId) return;

    setWorkspaceError("");
    setWorkspaceSuccess("");

    try {
      setMemberRoleLoadingId(membershipId);

      const response = await authedFetch(
        `${API_URL}/organizations/${activeOrganizationId}/members/${membershipId}/role`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke oppdatere rolle.");
        return;
      }

      setMembers((prev) =>
        prev.map((member) =>
          member.membershipId === membershipId
            ? { ...member, role: data.member.role }
            : member
        )
      );

      setWorkspaceSuccess("Rolle oppdatert.");
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da rollen skulle oppdateres."
      );
    } finally {
      setMemberRoleLoadingId("");
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!activeOrganizationId) return;

    setWorkspaceError("");
    setWorkspaceSuccess("");

    try {
      setMemberActionId(membershipId);

      const response = await authedFetch(
        `${API_URL}/organizations/${activeOrganizationId}/members/${membershipId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke fjerne medlem.");
        return;
      }

      setMembers((prev) =>
        prev.filter((member) => member.membershipId !== membershipId)
      );

      setOrganizations((prev) =>
        prev.map((item) =>
          item.organization.id === activeOrganizationId
            ? {
                ...item,
                organization: {
                  ...item.organization,
                  memberCount: Math.max(0, item.organization.memberCount - 1),
                },
              }
            : item
        )
      );

      setWorkspaceSuccess("Medlem fjernet.");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da medlemmet skulle fjernes."
      );
    } finally {
      setMemberActionId("");
    }
  }

  async function performDeleteWorkspace() {
    setWorkspaceError("");
    setWorkspaceSuccess("");

    if (!deleteOrganizationId) {
      setWorkspaceError("Velg et workspace du vil slette.");
      return;
    }

    if (deleteConfirmText.trim() !== "SLETT") {
      setWorkspaceError("Skriv SLETT for å bekrefte.");
      return;
    }

    try {
      setDeletingWorkspace(true);

      const result = await deleteWorkspaceWithReverification();

      if (!result) {
        return;
      }

      let response: Response | null = null;

      if (result instanceof Response) {
        response = result;
      } else {
        const possibleResult = result as { response?: unknown };

        if (possibleResult.response instanceof Response) {
          response = possibleResult.response;
        }
      }

      if (!response) {
        setWorkspaceError("Uventet respons fra re-verifisering.");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data?.error || "Kunne ikke slette workspace.");
        return;
      }

      const nextActiveOrganizationId =
        typeof data?.activeOrganizationId === "string" &&
        data.activeOrganizationId.trim() !== ""
          ? data.activeOrganizationId
          : null;

      const deletedId = deleteOrganizationId;

      const remainingOrganizations = organizations
        .filter((item) => item.organization.id !== deletedId)
        .map((item) => ({
          ...item,
          isActive: item.organization.id === nextActiveOrganizationId,
        }));

      setOrganizations(remainingOrganizations);
      setActiveOrganizationId(nextActiveOrganizationId);
      setDeleteOrganizationId("");
      setDeleteConfirmText("");
      setWorkspaceSuccess("Workspace slettet.");

      if (!nextActiveOrganizationId) {
        router.push("/onboarding");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace skulle slettes."
      );
    } finally {
      setDeletingWorkspace(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-6">
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

          <form
            onSubmit={handleSubmit}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
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
                style={{
                  backgroundColor: "var(--color-accent)",
                }}
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
              Workspaces
            </h3>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Bytt aktivt workspace, opprett et nytt, bli med i et eksisterende,
              eller administrer tilgang dersom du er owner.
            </p>
          </div>

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
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--color-text-soft)" }}
              >
                Du er i ferd med å opprette et nytt workspace med planen{" "}
                <span style={{ color: "var(--color-text)", fontWeight: 700 }}>
                  {getSelectedPlanLabel(onboardingSelectedPlan)}
                </span>
                .
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
                Aktiv workspace
              </p>
              <p
                className="mt-1 text-base font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {activeWorkspace?.organization.name ?? "Ingen valgt"}
              </p>
            </div>

            <div
              className="flex flex-col gap-2 text-sm"
              style={{ color: "var(--color-text)" }}
            >
              <label className="font-medium">Bytt workspace</label>
              <select
                value={activeOrganizationId ?? ""}
                onChange={(event) => handleSetActiveWorkspace(event.target.value)}
                disabled={switchingWorkspace || organizations.length === 0}
                className="rounded-xl border px-4 py-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                {organizations.map((item) => (
                  <option
                    key={item.organization.id}
                    value={item.organization.id}
                  >
                    {item.organization.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeWorkspace ? (
            <div
              className="mt-6 rounded-xl border p-4"
              style={{
                borderColor: "rgba(255, 106, 61, 0.22)",
                backgroundColor: "rgba(255, 106, 61, 0.08)",
              }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {activePlanName}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-soft)" }}
                  >
                    {activePlanDescription}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-soft)" }}
                  >
                    Medlemmer:{" "}
                    <span
                      className="font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      {activeMemberCount} / {activeMemberLimit}
                    </span>
                  </p>
                </div>

                {isOwnerOfActiveWorkspace && isWorkspaceFull ? (
                  <div className="flex flex-col items-start gap-2">
                    <Link
                      href="/plans"
                      className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      Oppgrader workspace
                    </Link>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-soft)" }}
                    >
                      Du har nådd maks antall medlemmer for denne planen.
                    </p>
                  </div>
                ) : null}
              </div>
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
              <h4
                className="text-base font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Opprett nytt workspace
              </h4>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-muted)" }}
              >
                {isCreateOpen ? "Skjul" : "Vis"}
              </span>
            </button>

            {isCreateOpen ? (
              <form
                onSubmit={handleCreateWorkspace}
                className="mt-4 grid gap-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
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

                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
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
              <h4
                className="text-base font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Bli med i workspace
              </h4>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-muted)" }}
              >
                {isJoinOpen ? "Skjul" : "Vis"}
              </span>
            </button>

            {isJoinOpen ? (
              <form onSubmit={handleJoinWorkspace} className="mt-4 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
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

                  <label
                    className="flex flex-col gap-2 text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
                    <span className="font-medium">Workspace-passord</span>
                    <input
                      type="password"
                      value={joinWorkspacePassword}
                      onChange={(event) =>
                        setJoinWorkspacePassword(event.target.value)
                      }
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

          {isOwnerOfActiveWorkspace ? (
            <div
              className="mt-6 rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <button
                type="button"
                onClick={() => setIsOwnerOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg bg-transparent px-2 py-1 text-left transition"
                style={{ color: "var(--color-text)" }}
              >
                <h4
                  className="text-base font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  Owner-tilgang
                </h4>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--color-muted)" }}
                >
                  {isOwnerOpen ? "Skjul" : "Vis"}
                </span>
              </button>

              {isOwnerOpen ? (
                <div className="mt-4 grid gap-6">
                  <div
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: "rgba(255, 106, 61, 0.22)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <p
                      className="text-xs font-medium uppercase tracking-wide"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Nåværende workspace-ID
                    </p>
                    <p
                      className="mt-1 break-all text-base font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      {activeWorkspace?.organization.id ?? "Ingen ID"}
                    </p>
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Del denne ID-en og workspace-passordet manuelt med medlemmer
                      som skal bli med.
                    </p>
                  </div>

                  <form
                    onSubmit={handleRenameWorkspace}
                    className="grid gap-4 rounded-xl border p-4"
                    style={{
                      borderColor: "rgba(255, 106, 61, 0.22)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <label
                      className="flex flex-col gap-2 text-sm"
                      style={{ color: "var(--color-text)" }}
                    >
                      <span className="font-medium">Navn på workspace</span>
                      <input
                        value={ownerWorkspaceName}
                        onChange={(event) =>
                          setOwnerWorkspaceName(event.target.value)
                        }
                        placeholder="F.eks. Scopio Studio"
                        className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>

                    <div className="flex justify-start">
                      <button
                        type="submit"
                        disabled={renamingWorkspace}
                        className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: "rgba(255, 106, 61, 0.35)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-accent)",
                        }}
                      >
                        {renamingWorkspace ? "Oppdaterer..." : "Oppdater navn"}
                      </button>
                    </div>
                  </form>

                  <form
                    onSubmit={handleUpdateWorkspacePassword}
                    className="grid gap-4 rounded-xl border p-4"
                    style={{
                      borderColor: "rgba(255, 106, 61, 0.22)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <label
                      className="flex flex-col gap-2 text-sm"
                      style={{ color: "var(--color-text)" }}
                    >
                      <span className="font-medium">Nytt workspace-passord</span>
                      <input
                        type="password"
                        value={ownerNewPassword}
                        onChange={(event) =>
                          setOwnerNewPassword(event.target.value)
                        }
                        placeholder="Minst 4 tegn"
                        className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>

                    <div className="flex justify-start">
                      <button
                        type="submit"
                        disabled={updatingWorkspacePassword}
                        className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          borderColor: "rgba(255, 106, 61, 0.35)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-accent)",
                        }}
                      >
                        {updatingWorkspacePassword
                          ? "Oppdaterer..."
                          : "Oppdater workspace-passord"}
                      </button>
                    </div>
                  </form>

                  <div
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <h5
                        className="text-base font-semibold"
                        style={{ color: "var(--color-text)" }}
                      >
                        Medlemmer
                      </h5>
                      <span
                        className="text-sm"
                        style={{ color: "var(--color-muted)" }}
                      >
                        {loadingMembers
                          ? "Laster..."
                          : `${activeMemberCount} / ${activeMemberLimit}`}
                      </span>
                    </div>

                    {isWorkspaceFull ? (
                      <div
                        className="mt-4 rounded-xl border px-4 py-3 text-sm"
                        style={{
                          borderColor: "rgba(255, 106, 61, 0.22)",
                          backgroundColor: "rgba(255, 106, 61, 0.08)",
                          color: "var(--color-text-soft)",
                        }}
                      >
                        Dette workspace-et har nådd maks antall medlemmer for
                        planen sin. Oppgrader dette workspace-et for å få flere
                        medlemsplasser.
                        <div className="mt-3">
                          <Link
                            href="/plans"
                            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
                            style={{ backgroundColor: "var(--color-accent)" }}
                          >
                            Oppgrader workspace
                          </Link>
                        </div>
                      </div>
                    ) : null}

                    {loadingMembers ? (
                      <div
                        className="mt-4 text-sm"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Henter medlemmer...
                      </div>
                    ) : members.length === 0 ? (
                      <div
                        className="mt-4 text-sm"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Ingen medlemmer funnet.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {members.map((member) => {
                          const isLocked = member.role === "OWNER";

                          return (
                            <div
                              key={member.membershipId}
                              className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
                              style={{
                                borderColor: "var(--color-border)",
                                backgroundColor: "var(--color-surface-soft)",
                              }}
                            >
                              <div className="min-w-0">
                                <p
                                  className="truncate text-sm font-semibold"
                                  style={{ color: "var(--color-text)" }}
                                >
                                  {member.user.name || member.user.email}
                                </p>
                                <p
                                  className="truncate text-sm"
                                  style={{ color: "var(--color-muted)" }}
                                >
                                  {member.user.email}
                                </p>
                              </div>

                              <div>
                                <select
                                  value={member.role}
                                  disabled={
                                    isLocked ||
                                    memberRoleLoadingId === member.membershipId
                                  }
                                  onChange={(event) =>
                                    handleRoleChange(
                                      member.membershipId,
                                      event.target.value as "ADMIN" | "MEMBER"
                                    )
                                  }
                                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    borderColor: "var(--color-border)",
                                    backgroundColor: "var(--color-surface)",
                                    color: "var(--color-text)",
                                  }}
                                >
                                  <option value="OWNER">Owner</option>
                                  <option value="ADMIN">Admin</option>
                                  <option value="MEMBER">Member</option>
                                </select>
                              </div>

                              <div className="flex justify-start lg:justify-end">
                                <button
                                  type="button"
                                  disabled={
                                    isLocked ||
                                    memberActionId === member.membershipId
                                  }
                                  onClick={() =>
                                    handleRemoveMember(member.membershipId)
                                  }
                                  className="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    borderColor: "rgba(220, 38, 38, 0.35)",
                                    backgroundColor: "var(--color-surface)",
                                    color: "#f87171",
                                  }}
                                >
                                  {memberActionId === member.membershipId
                                    ? "Fjerner..."
                                    : "Fjern"}
                                </button>
                              </div>

                              <div className="lg:col-span-3">
                                <p
                                  className="text-xs"
                                  style={{ color: "var(--color-muted)" }}
                                >
                                  Rolle: {formatRole(member.role)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    className="rounded-xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text-soft)",
                    }}
                  >
                    For å overføre eierskap til en annen i workspace-et, kontakt
                    kundeservice.
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {isOwnerOfActiveWorkspace ? (
            <div
              className="mt-6 rounded-xl border p-4"
              style={{
                borderColor: "rgba(220, 38, 38, 0.25)",
                backgroundColor: "rgba(220, 38, 38, 0.08)",
              }}
            >
              <div className="flex flex-col gap-2">
                <h4
                  className="text-base font-semibold"
                  style={{ color: "var(--color-danger-text)" }}
                >
                  Slett workspace
                </h4>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-danger-text)" }}
                >
                  Dette sletter workspace-et, abonnementet og tilknyttede data
                  permanent. Dette kan ikke angres.
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-danger-text)" }}
                >
                  Du må være owner. Skriv{" "}
                  <span className="font-semibold">SLETT</span> for å bekrefte.
                </p>
              </div>

              <div className="mt-4 grid gap-4">
                <label
                  className="flex flex-col gap-2 text-sm"
                  style={{ color: "var(--color-text)" }}
                >
                  <span
                    className="font-medium"
                    style={{ color: "var(--color-danger-text)" }}
                  >
                    Velg workspace som skal slettes
                  </span>
                  <select
                    value={deleteOrganizationId}
                    onChange={(event) =>
                      setDeleteOrganizationId(event.target.value)
                    }
                    disabled={deletingWorkspace || !isOwnerOfActiveWorkspace}
                    className="rounded-xl border px-4 py-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: "rgba(220, 38, 38, 0.35)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value="">Velg workspace</option>
                    {ownerOrganizations.map((item) => (
                      <option
                        key={item.organization.id}
                        value={item.organization.id}
                      >
                        {item.organization.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className="flex flex-col gap-2 text-sm"
                  style={{ color: "var(--color-text)" }}
                >
                  <span
                    className="font-medium"
                    style={{ color: "var(--color-danger-text)" }}
                  >
                    Skriv SLETT for å bekrefte
                  </span>
                  <input
                    value={deleteConfirmText}
                    onChange={(event) =>
                      setDeleteConfirmText(event.target.value)
                    }
                    placeholder="SLETT"
                    disabled={deletingWorkspace || !isOwnerOfActiveWorkspace}
                    className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: "rgba(220, 38, 38, 0.35)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                </label>

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={performDeleteWorkspace}
                    disabled={!canDeleteWorkspace}
                    className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      backgroundColor: "#dc2626",
                    }}
                  >
                    {deletingWorkspace ? "Sletter..." : "Slett workspace"}
                  </button>
                </div>

                {deletableWorkspace ? (
                  <div
                    className="rounded-xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "rgba(220, 38, 38, 0.25)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-danger-text)",
                    }}
                  >
                    Du er i ferd med å slette{" "}
                    <span className="font-semibold">
                      {deletableWorkspace.organization.name}
                    </span>
                    .
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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
      </div>

      <aside
        className="rounded-xl border p-6 shadow-sm"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Session
        </h3>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          Logg ut av Scopio på denne enheten.
        </p>

        <div className="mt-5">
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition"
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
      </aside>
    </div>
  );
}