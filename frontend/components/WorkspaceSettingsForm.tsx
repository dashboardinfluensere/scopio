"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, useReverification } from "@clerk/nextjs";
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

type WorkspaceSettingsFormProps = {
  initialOrganizations: OrganizationItem[];
  initialActiveOrganizationId: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return null;

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(dateString));
}

function getPlanName(subscription: SubscriptionInfo) {
  if (!subscription) return "Ukjent plan";
  if (subscription.plan === "BUSINESS") return "Business";
  if (subscription.plan === "PRO" && subscription.status === "TRIALING") return "Pro Trial";
  if (subscription.plan === "PRO") return "Pro";
  if (subscription.plan === "STARTER") return "Starter";
  return "Free";
}

function getPlanDescription(subscription: SubscriptionInfo) {
  if (!subscription) return "Workspace-plan settes opp.";

  if (subscription.status === "TRIALING") {
    const daysLeft = getDaysLeft(subscription.currentPeriodEnd);

    if (typeof daysLeft === "number") {
      return `Prøveperioden er aktiv. ${daysLeft} dag${
        daysLeft === 1 ? "" : "er"
      } igjen.`;
    }

    return "Prøveperioden er aktiv.";
  }

  if (subscription.status === "ACTIVE") {
    if (subscription.cancelAtPeriodEnd) {
      const endDate = formatDate(subscription.currentPeriodEnd);

      return endDate
        ? `Medlemskapet er avsluttet og er aktivt frem til ${endDate}.`
        : "Medlemskapet er avsluttet og er aktivt ut perioden.";
    }

    return "Abonnementet er aktivt.";
  }

  return `Status: ${subscription.status}`;
}

export default function WorkspaceSettingsForm({
  initialOrganizations,
  initialActiveOrganizationId,
}: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const authedFetch = useAuthedFetch();

  const [organizations, setOrganizations] =
    useState<OrganizationItem[]>(initialOrganizations);
  const [activeOrganizationId] = useState(initialActiveOrganizationId);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSuccess, setWorkspaceSuccess] = useState("");
  const [manualCancellationRequired, setManualCancellationRequired] = useState(false);

  const [ownerWorkspaceName, setOwnerWorkspaceName] = useState("");
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [ownerNewPassword, setOwnerNewPassword] = useState("");
  const [updatingWorkspacePassword, setUpdatingWorkspacePassword] = useState(false);

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberActionId, setMemberActionId] = useState("");
  const [memberRoleLoadingId, setMemberRoleLoadingId] = useState("");

  const [deleteOrganizationId, setDeleteOrganizationId] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [reactivatingWorkspace, setReactivatingWorkspace] = useState(false);

  const activeWorkspace = organizations.find(
    (item) => item.organization.id === activeOrganizationId
  );

  const ownerOrganizations = organizations.filter((item) => item.role === "OWNER");
  const isOwnerOfActiveWorkspace = activeWorkspace?.role === "OWNER";

  const activeSubscription = activeWorkspace?.organization.subscription ?? null;
  const activePlanName = getPlanName(activeSubscription);
  const activePlanDescription = getPlanDescription(activeSubscription);
  const activeMemberCount = activeWorkspace?.organization.memberCount ?? 0;
  const activeMemberLimit = activeWorkspace?.organization.memberLimit ?? 0;
  const isWorkspaceFull =
    activeMemberLimit > 0 && activeMemberCount >= activeMemberLimit;

  const deletableWorkspace = organizations.find(
    (item) => item.organization.id === deleteOrganizationId
  );

  const selectedSubscription = deletableWorkspace?.organization.subscription ?? null;
  const selectedMembershipIsCanceled = selectedSubscription?.cancelAtPeriodEnd === true;

  const supportEmail = "Dmytro@Maliarchuk.no";
  const supportSubject = "Avslutte medlemskap i Scopio";

  const supportBody = `Hei!

Jeg ønsker å avslutte medlemskapet mitt i Scopio.

Workspace: ${deletableWorkspace?.organization.name ?? ""}
Workspace-ID: ${deleteOrganizationId}

Jeg ønsker at medlemskapet avsluttes og at tilknyttet workspace/data slettes.

Mvh`;

  const supportGmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    supportEmail
  )}&su=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`;

  const canDeleteWorkspace =
    isOwnerOfActiveWorkspace &&
    !!deleteOrganizationId &&
    !selectedMembershipIsCanceled &&
    deleteConfirmText.trim() === "AVSLUTT" &&
    !deletingWorkspace &&
    !reactivatingWorkspace;

  const canReactivateWorkspace =
    isOwnerOfActiveWorkspace &&
    !!deleteOrganizationId &&
    selectedMembershipIsCanceled &&
    !deletingWorkspace &&
    !reactivatingWorkspace;

  const deleteWorkspaceWithReverification = useReverification(async () => {
    const response = await fetch(`/api/organizations/${deleteOrganizationId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmationText: "AVSLUTT",
      }),
    });

    if (response.status === 403) {
      return response;
    }

    const responseText = await response.clone().text();
    let data: any = null;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      setWorkspaceError(
        responseText.startsWith("<")
          ? "Serveren svarte med HTML i stedet for JSON. Sjekk frontend API-routen, backend og API_URL."
          : responseText || "Uventet respons fra serveren."
      );
      return response;
    }

    if (!response.ok) {
      const errorMessage = data?.error || "Kunne ikke avslutte medlemskapet.";

      if (
        data?.code === "MANUAL_CANCELLATION_REQUIRED" ||
        errorMessage.toLowerCase().includes("mangler sluttdato") ||
        errorMessage.toLowerCase().includes("kan ikke planlegge automatisk sletting")
      ) {
        setWorkspaceError("");
        setManualCancellationRequired(true);
        return response;
      }

      setWorkspaceError(errorMessage);
      return response;
    }

    const canceledId = deleteOrganizationId;
    const scheduledDeletionAt =
      typeof data?.scheduledDeletionAt === "string" ? data.scheduledDeletionAt : null;
    const currentPeriodEnd =
      typeof data?.currentPeriodEnd === "string"
        ? data.currentPeriodEnd
        : scheduledDeletionAt;

    setOrganizations((prev) =>
      prev.map((item) => {
        if (item.organization.id !== canceledId) return item;

        const currentSubscription = item.organization.subscription;

        return {
          ...item,
          organization: {
            ...item.organization,
            subscription: currentSubscription
              ? {
                  ...currentSubscription,
                  cancelAtPeriodEnd: true,
                  currentPeriodEnd: currentPeriodEnd ?? currentSubscription.currentPeriodEnd,
                }
              : currentSubscription,
          },
        };
      })
    );

    setDeleteConfirmText("");

    const formattedEndDate = formatDate(currentPeriodEnd);

    setWorkspaceSuccess(
      formattedEndDate
        ? `Medlemskapet er avsluttet. Du beholder tilgang frem til ${formattedEndDate}. Etter dette slettes workspace og tilknyttede data automatisk.`
        : "Medlemskapet er avsluttet. Du beholder tilgang frem til perioden er over. Etter dette slettes workspace og tilknyttede data automatisk."
    );

    router.refresh();
    return response;
  });

  useEffect(() => {
    setOwnerWorkspaceName(activeWorkspace?.organization.name ?? "");
  }, [activeWorkspace?.organization.id, activeWorkspace?.organization.name]);

  useEffect(() => {
    if (ownerOrganizations.length === 1 && !deleteOrganizationId && isOwnerOfActiveWorkspace) {
      setDeleteOrganizationId(ownerOrganizations[0].organization.id);
    }
  }, [deleteOrganizationId, isOwnerOfActiveWorkspace, ownerOrganizations]);

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

        const response = await fetch(`${API_URL}/organizations/${activeOrganizationId}/members`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

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
                    memberCount: data.memberCount ?? item.organization.memberCount,
                    memberLimit: data.memberLimit ?? item.organization.memberLimit,
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

      const response = await authedFetch(`${API_URL}/organizations/${activeOrganizationId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmedName }),
      });

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke endre navn på workspace.");
        return;
      }

      setOrganizations((prev) =>
        prev.map((item) =>
          item.organization.id === activeOrganizationId
            ? { ...item, organization: data.organization }
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

  async function handleUpdateWorkspacePassword(event: React.FormEvent<HTMLFormElement>) {
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
          body: JSON.stringify({ password: trimmedPassword }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke oppdatere workspace-passord.");
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

  async function handleRoleChange(membershipId: string, role: "ADMIN" | "MEMBER") {
    if (!activeOrganizationId) return;
    setWorkspaceError("");
    setWorkspaceSuccess("");

    try {
      setMemberRoleLoadingId(membershipId);

      const response = await authedFetch(
        `${API_URL}/organizations/${activeOrganizationId}/members/${membershipId}/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke oppdatere rolle.");
        return;
      }

      setMembers((prev) =>
        prev.map((member) =>
          member.membershipId === membershipId ? { ...member, role: data.member.role } : member
        )
      );

      setWorkspaceSuccess("Rolle oppdatert.");
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : "Noe gikk galt da rollen skulle oppdateres."
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
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data.error || "Kunne ikke fjerne medlem.");
        return;
      }

      setMembers((prev) => prev.filter((member) => member.membershipId !== membershipId));

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
        err instanceof Error ? err.message : "Noe gikk galt da medlemmet skulle fjernes."
      );
    } finally {
      setMemberActionId("");
    }
  }

  async function performDeleteWorkspace() {
    setWorkspaceError("");
    setWorkspaceSuccess("");
    setManualCancellationRequired(false);

    if (!deleteOrganizationId) {
      setWorkspaceError("Velg et medlemskap du vil avslutte.");
      return;
    }

    if (deleteConfirmText.trim() !== "AVSLUTT") {
      setWorkspaceError("Skriv AVSLUTT for å bekrefte.");
      return;
    }

    try {
      setDeletingWorkspace(true);
      await deleteWorkspaceWithReverification();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da medlemskapet skulle avsluttes."
      );
    } finally {
      setDeletingWorkspace(false);
    }
  }

  async function performReactivateWorkspace() {
    setWorkspaceError("");
    setWorkspaceSuccess("");
    setManualCancellationRequired(false);

    if (!deleteOrganizationId) {
      setWorkspaceError("Velg et medlemskap du vil reaktivere.");
      return;
    }

    try {
      setReactivatingWorkspace(true);

      const response = await authedFetch(`${API_URL}/organizations/${deleteOrganizationId}/reactivate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        setWorkspaceError(data?.error || "Kunne ikke reaktivere medlemskapet.");
        return;
      }

      setOrganizations((prev) =>
        prev.map((item) => {
          if (item.organization.id !== deleteOrganizationId) return item;

          const currentSubscription = item.organization.subscription;

          return {
            ...item,
            organization: {
              ...item.organization,
              subscription: currentSubscription
                ? {
                    ...currentSubscription,
                    cancelAtPeriodEnd: false,
                    currentPeriodEnd:
                      typeof data?.currentPeriodEnd === "string"
                        ? data.currentPeriodEnd
                        : currentSubscription.currentPeriodEnd,
                  }
                : currentSubscription,
            },
          };
        })
      );

      setDeleteConfirmText("");
      setWorkspaceSuccess("Medlemskapet er reaktivert. Automatisk sletting er avbrutt.");
      router.refresh();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da medlemskapet skulle reaktiveres."
      );
    } finally {
      setReactivatingWorkspace(false);
    }
  }

  if (!activeWorkspace) {
    return (
      <section
        className="rounded-xl border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
          Workspace-innstillinger
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
          Ingen aktiv workspace valgt. Opprett eller bli med i et workspace under Min konto.
        </p>
      </section>
    );
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
          <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
            Workspace-innstillinger
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Administrer workspace, medlemmer, passord og medlemskap.
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
            <p className="mt-1 text-base font-semibold" style={{ color: "var(--color-text)" }}>
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
              Plan
            </p>
            <p className="mt-1 text-base font-semibold" style={{ color: "var(--color-text)" }}>
              {activePlanName}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-soft)" }}>
              {activePlanDescription}
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
            <p className="mt-1 text-base font-semibold" style={{ color: "var(--color-text)" }}>
              {activeMemberCount} / {activeMemberLimit}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
              Din rolle: {formatRole(activeWorkspace.role)}
            </p>
          </div>
        </div>

        {isOwnerOfActiveWorkspace ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/account/workspace-settings/change-plan"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Endre plan
            </Link>

            {isWorkspaceFull ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Du har nådd maks antall medlemmer for denne planen.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {isOwnerOfActiveWorkspace ? (
        <section
          className="rounded-xl border p-6 shadow-sm"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <h3 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
            Workspace
          </h3>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <form
              onSubmit={handleRenameWorkspace}
              className="grid gap-4 rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-soft)",
              }}
            >
              <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                <span className="font-medium">Navn på workspace</span>
                <input
                  value={ownerWorkspaceName}
                  onChange={(event) => setOwnerWorkspaceName(event.target.value)}
                  placeholder="F.eks. Scopio Studio"
                  className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={renamingWorkspace}
                className="inline-flex w-fit items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "rgba(255, 106, 61, 0.35)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-accent)",
                }}
              >
                {renamingWorkspace ? "Oppdaterer..." : "Oppdater navn"}
              </button>
            </form>

            <form
              onSubmit={handleUpdateWorkspacePassword}
              className="grid gap-4 rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-soft)",
              }}
            >
              <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                <span className="font-medium">Nytt workspace-passord</span>
                <input
                  type="password"
                  value={ownerNewPassword}
                  onChange={(event) => setOwnerNewPassword(event.target.value)}
                  placeholder="Minst 4 tegn"
                  className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)]"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={updatingWorkspacePassword}
                className="inline-flex w-fit items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "rgba(255, 106, 61, 0.35)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-accent)",
                }}
              >
                {updatingWorkspacePassword ? "Oppdaterer..." : "Oppdater workspace-passord"}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section
        className="rounded-xl border p-6 shadow-sm"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
            Medlemmer
          </h3>
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>
            {loadingMembers ? "Laster..." : `${activeMemberCount} / ${activeMemberLimit}`}
          </span>
        </div>

        {!isOwnerOfActiveWorkspace ? (
          <div
            className="mt-4 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
              color: "var(--color-muted)",
            }}
          >
            Du må være owner for å administrere medlemmer.
          </div>
        ) : loadingMembers ? (
          <div className="mt-4 text-sm" style={{ color: "var(--color-muted)" }}>
            Henter medlemmer...
          </div>
        ) : members.length === 0 ? (
          <div className="mt-4 text-sm" style={{ color: "var(--color-muted)" }}>
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
                    <p className="truncate text-sm" style={{ color: "var(--color-muted)" }}>
                      {member.user.email}
                    </p>
                  </div>

                  <select
                    value={member.role}
                    disabled={isLocked || memberRoleLoadingId === member.membershipId}
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

                  <button
                    type="button"
                    disabled={isLocked || memberActionId === member.membershipId}
                    onClick={() => handleRemoveMember(member.membershipId)}
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: "rgba(220, 38, 38, 0.35)",
                      backgroundColor: "var(--color-surface)",
                      color: "#f87171",
                    }}
                  >
                    {memberActionId === member.membershipId ? "Fjerner..." : "Fjern"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isOwnerOfActiveWorkspace ? (
        <section
          className="rounded-xl border p-6 shadow-sm"
          style={{
            borderColor: "rgba(220, 38, 38, 0.25)",
            backgroundColor: "rgba(220, 38, 38, 0.08)",
          }}
        >
          <h3 className="text-xl font-semibold" style={{ color: "var(--color-danger-text)" }}>
            Avslutt medlemskap
          </h3>

          <p className="mt-2 text-sm" style={{ color: "var(--color-danger-text)" }}>
            Du beholder tilgang til Scopio frem til den betalte perioden er over. Etter
            dette slettes workspace og tilknyttede data automatisk.
          </p>

          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
              <span className="font-medium" style={{ color: "var(--color-danger-text)" }}>
                Velg workspace/medlemskap som skal avsluttes
              </span>

              <select
                value={deleteOrganizationId}
                onChange={(event) => setDeleteOrganizationId(event.target.value)}
                disabled={deletingWorkspace || reactivatingWorkspace || !isOwnerOfActiveWorkspace}
                className="rounded-xl border px-4 py-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "rgba(220, 38, 38, 0.35)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="">Velg workspace</option>
                {ownerOrganizations.map((item) => (
                  <option key={item.organization.id} value={item.organization.id}>
                    {item.organization.name}
                  </option>
                ))}
              </select>
            </label>

            {!selectedMembershipIsCanceled ? (
              <label
                className="flex flex-col gap-2 text-sm"
                style={{ color: "var(--color-text)" }}
              >
                <span className="font-medium" style={{ color: "var(--color-danger-text)" }}>
                  Skriv AVSLUTT for å bekrefte
                </span>

                <input
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="AVSLUTT"
                  disabled={deletingWorkspace || reactivatingWorkspace || !isOwnerOfActiveWorkspace}
                  className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: "rgba(220, 38, 38, 0.35)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                />
              </label>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {!selectedMembershipIsCanceled ? (
                <button
                  type="button"
                  onClick={performDeleteWorkspace}
                  disabled={!canDeleteWorkspace}
                  className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  {deletingWorkspace ? "Avslutter..." : "Avslutt medlemskap"}
                </button>
              ) : null}

              {selectedMembershipIsCanceled ? (
                <button
                  type="button"
                  onClick={performReactivateWorkspace}
                  disabled={!canReactivateWorkspace}
                  className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    border: "1px solid var(--color-success-text)",
                    backgroundColor: "rgba(22, 163, 74, 0.12)",
                    color: "var(--color-success-text)",
                  }}
                >
                  {reactivatingWorkspace ? "Reaktiverer..." : "Reaktiver medlemskap"}
                </button>
              ) : null}
            </div>

            {deletableWorkspace ? (
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: selectedMembershipIsCanceled
                    ? "var(--color-success-bg)"
                    : "rgba(220, 38, 38, 0.25)",
                  backgroundColor: "var(--color-surface)",
                  color: selectedMembershipIsCanceled
                    ? "var(--color-success-text)"
                    : "var(--color-danger-text)",
                }}
              >
                {selectedMembershipIsCanceled
                  ? "Medlemskapet er allerede avsluttet for "
                  : "Du er i ferd med å avslutte medlemskapet for "}
                <span className="font-semibold">{deletableWorkspace.organization.name}</span>.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {manualCancellationRequired ? (
        <div
          className="rounded-xl border px-4 py-4 text-sm"
          style={{
            borderColor: "rgba(255, 106, 61, 0.28)",
            backgroundColor: "rgba(255, 106, 61, 0.08)",
            color: "var(--color-text-soft)",
          }}
        >
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>
            Vi må avslutte dette manuelt
          </p>

          <p className="mt-2">
            Dette medlemskapet kan ikke avsluttes automatisk akkurat nå. Send oss en
            e-post, så avslutter vi medlemskapet og sletter workspace/data manuelt for
            deg.
          </p>

          <button
            type="button"
            onClick={() => {
              window.open(supportGmailHref, "_blank", "noopener,noreferrer");
            }}
            className="mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Kontakt kundeservice
          </button>
        </div>
      ) : null}

      {workspaceError ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
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
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--color-success-bg)",
            backgroundColor: "var(--color-success-bg)",
            color: "var(--color-success-text)",
          }}
        >
          {workspaceSuccess}
        </div>
      ) : null}
    </div>
  );
}