"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getClientApiUrl } from "../lib/api";

type LatestJobSummary = {
  id: string;
  type: "INITIAL" | "DAILY";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type SocialAccount = {
  id: string;
  platform: "TIKTOK" | "INSTAGRAM";
  accountHandle: string;
  displayName: string | null;
  profileUrl: string | null;
  status: string;
  initialSyncStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  isActive: boolean;
  createdAt: string;
  latestInitialJob: LatestJobSummary | null;
  latestDailyJob: LatestJobSummary | null;
  retry: {
    canRetryInitial: boolean;
    canRetryDaily: boolean;
  };
};

type TrackedAccountsManagerProps = {
  initialAccounts: SocialAccount[];
  activeWorkspaceName: string;
  monthlyAddLimit: number;
  initialAddsThisPeriod: number;
  nextAvailableAddAt: string | null;
  canAddAccounts: boolean;
  canDeleteAccounts: boolean;
  role: string | null;
};

type Platform = "TIKTOK" | "INSTAGRAM";
type RetryableJobType = "INITIAL" | "DAILY";
type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

type CreateSocialAccountResponse = {
  ok: boolean;
  action?: "created" | "reactivated";
  message?: string;
  error?: string;
  socialAccount?: SocialAccount;
  usage?: {
    accountsAddedThisPeriod: number;
    monthlyAddsRemaining: number;
    nextAvailableAddAt?: string | null;
  };
};

type DeleteSocialAccountResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  socialAccount?: SocialAccount;
  usage?: {
    activeAccounts: number;
  };
};

type UpdateDisplayNameResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  socialAccount?: SocialAccount;
};

type RetryScrapeResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  retry?: {
    jobType: RetryableJobType;
    queuedJob: LatestJobSummary | null;
  };
};

type SocialAccountsResponse = {
  ok: boolean;
  accounts: SocialAccount[];
  usage?: {
    accountsAddedThisPeriod?: number;
    nextAvailableAddAt?: string | null;
  };
};

const API_URL = getClientApiUrl();

function getPlatformLabel(platform: Platform) {
  return platform === "TIKTOK" ? "TikTok" : "Instagram";
}

function buildProfileUrl(platform: Platform, handle: string) {
  const cleanHandle = handle.replace(/^@/, "").trim();

  if (platform === "TIKTOK") {
    return `https://www.tiktok.com/@${cleanHandle}`;
  }

  return `https://www.instagram.com/${cleanHandle}/`;
}

function extractHandle(input: string, platform: Platform) {
  const value = input.trim();

  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);

      if (platform === "TIKTOK") {
        const match = url.pathname.match(/@([^/]+)/);
        return match?.[1]?.trim() ?? "";
      }

      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0]?.trim() ?? "";
    } catch {
      return "";
    }
  }

  return value.replace(/^@/, "").trim();
}

function getAccountLabel(account: SocialAccount) {
  return account.displayName?.trim() || `@${account.accountHandle}`;
}

function getDaysUntil(dateString: string | null) {
  if (!dateString) return null;

  const now = new Date();
  const target = new Date(dateString);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

function formatNorwegianDate(dateString: string | null) {
  if (!dateString) return null;

  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
  }).format(new Date(dateString));
}

function getInitialSyncLabel(status: SocialAccount["initialSyncStatus"]) {
  if (status === "COMPLETED") return "Klar";
  if (status === "RUNNING") return "Synkroniserer";
  if (status === "FAILED") return "Feilet";
  return "Venter";
}

function getJobStatusLabel(status: JobStatus) {
  if (status === "COMPLETED") return "Vellykket";
  if (status === "RUNNING") return "Kjører";
  if (status === "FAILED") return "Feilet";
  return "Venter";
}

function getInitialSyncBadgeClasses(status: SocialAccount["initialSyncStatus"]) {
  if (status === "COMPLETED") {
    return "border-[#166534] bg-[#052e1a] text-[#86efac]";
  }

  if (status === "RUNNING") {
    return "border-[#1d4ed8] bg-[#0b1f3a] text-[#93c5fd]";
  }

  if (status === "FAILED") {
    return "border-[#7f1d1d] bg-[#3b0d0d] text-[#fca5a5]";
  }

  return "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

function getJobBadgeClasses(status: JobStatus) {
  if (status === "COMPLETED") {
    return "border-[#166534] bg-[#052e1a] text-[#86efac]";
  }

  if (status === "RUNNING") {
    return "border-[#1d4ed8] bg-[#0b1f3a] text-[#93c5fd]";
  }

  if (status === "FAILED") {
    return "border-[#7f1d1d] bg-[#3b0d0d] text-[#fca5a5]";
  }

  return "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

function hasPendingOrRunningWork(account: SocialAccount) {
  return (
    account.initialSyncStatus === "PENDING" ||
    account.initialSyncStatus === "RUNNING" ||
    account.latestDailyJob?.status === "PENDING" ||
    account.latestDailyJob?.status === "RUNNING"
  );
}

export default function TrackedAccountsManager({
  initialAccounts,
  activeWorkspaceName,
  monthlyAddLimit,
  initialAddsThisPeriod,
  nextAvailableAddAt: initialNextAvailableAddAt,
  canAddAccounts,
  canDeleteAccounts,
  role,
}: TrackedAccountsManagerProps) {
  const { getToken } = useAuth();

  const [accounts, setAccounts] = useState(initialAccounts);
  const [platform, setPlatform] = useState<Platform>("TIKTOK");
  const [accountInput, setAccountInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [addsThisPeriod, setAddsThisPeriod] = useState(initialAddsThisPeriod);
  const [nextAvailableAddAt, setNextAvailableAddAt] = useState(
    initialNextAvailableAddAt
  );

  const [deleteModalAccount, setDeleteModalAccount] = useState<SocialAccount | null>(
    null
  );

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [savingDisplayNameId, setSavingDisplayNameId] = useState<string | null>(
    null
  );

  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  const parsedHandle = useMemo(
    () => extractHandle(accountInput, platform),
    [accountInput, platform]
  );

  const previewProfileUrl = parsedHandle
    ? buildProfileUrl(platform, parsedHandle)
    : "";

  const addLimitReached = addsThisPeriod >= monthlyAddLimit;
  const canActuallyAdd = canAddAccounts && !addLimitReached;
  const canDeleteAny = canDeleteAccounts && accounts.length > 1;
  const canEditDisplayName = role === "OWNER" || role === "ADMIN";
  const canRetryFailedScrapes = role === "OWNER" || role === "ADMIN";

  const daysUntilNextAdd = getDaysUntil(nextAvailableAddAt);
  const nextAddDateLabel = formatNorwegianDate(nextAvailableAddAt);

  async function getAuthHeaders(includeJson = true) {
    const token = await getToken();

    if (!token) {
      throw new Error("Du er ikke autentisert");
    }

    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    };
  }

  async function refreshAccounts() {
    const headers = await getAuthHeaders(false);

    const response = await fetch(`${API_URL}/social-accounts`, {
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      throw new Error("Kunne ikke hente oppdaterte kontoer");
    }

    const data: SocialAccountsResponse = await response.json();

    if (!data.ok || !Array.isArray(data.accounts)) {
      throw new Error("Ugyldig svar ved oppdatering av kontoer");
    }

    setAccounts(data.accounts);

    if (typeof data.usage?.accountsAddedThisPeriod === "number") {
      setAddsThisPeriod(data.usage.accountsAddedThisPeriod);
    }

    if (typeof data.usage?.nextAvailableAddAt !== "undefined") {
      setNextAvailableAddAt(data.usage.nextAvailableAddAt ?? null);
    }
  }

  useEffect(() => {
    if (!displayNameTouched) {
      setDisplayName(parsedHandle);
    }
  }, [parsedHandle, displayNameTouched]);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    const hasPendingWork = accounts.some(hasPendingOrRunningWork);

    if (!hasPendingWork) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        await refreshAccounts();
      } catch {
      }
    }, 12000);

    return () => window.clearInterval(interval);
  }, [accounts, getToken]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    const cleanHandle = parsedHandle;

    if (!canActuallyAdd) {
      setError(
        `Dette workspace-et har nådd maks antall nye kontoer de siste 30 dagene (${monthlyAddLimit}).`
      );
      return;
    }

    if (!cleanHandle) {
      setError("Skriv inn et gyldig brukernavn eller lim inn en profil-lenke.");
      return;
    }

    try {
      setSubmitting(true);

      const headers = await getAuthHeaders();

      const response = await fetch(`${API_URL}/social-accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          platform,
          accountHandle: cleanHandle,
          displayName: displayName.trim() || null,
          profileUrl: buildProfileUrl(platform, cleanHandle),
        }),
      });

      const data: CreateSocialAccountResponse = await response.json();

      if (!response.ok || !data.socialAccount) {
        setError(data.error || "Kunne ikke legge til konto.");
        return;
      }

      setAccounts((prev) => {
        const withoutSameId = prev.filter(
          (account) => account.id !== data.socialAccount!.id
        );

        return [data.socialAccount!, ...withoutSameId];
      });

      if (typeof data.usage?.accountsAddedThisPeriod === "number") {
        setAddsThisPeriod(data.usage.accountsAddedThisPeriod);
      }

      setNextAvailableAddAt(data.usage?.nextAvailableAddAt ?? null);
      setAccountInput("");
      setDisplayName("");
      setDisplayNameTouched(false);
      setSuccessMessage(
        data.action === "reactivated"
          ? "Konto aktivert igjen og initial scrape startet."
          : "Konto lagt til og initial scrape startet."
      );

      await refreshAccounts();
    } catch {
      setError("Noe gikk galt da kontoen skulle legges til.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditingDisplayName(account: SocialAccount) {
    if (!canEditDisplayName) {
      setError("Kun owner eller admin kan redigere visningsnavn.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setEditingAccountId(account.id);
    setEditingDisplayName(account.displayName ?? "");
  }

  function cancelEditingDisplayName() {
    if (savingDisplayNameId) return;
    setEditingAccountId(null);
    setEditingDisplayName("");
  }

  async function saveDisplayName(accountId: string) {
    setError("");
    setSuccessMessage("");

    try {
      setSavingDisplayNameId(accountId);

      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/social-accounts/${accountId}/display-name`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            displayName: editingDisplayName,
          }),
        }
      );

      const data: UpdateDisplayNameResponse = await response.json();

      if (!response.ok || !data.socialAccount) {
        setError(data.error || "Kunne ikke oppdatere visningsnavn.");
        return;
      }

      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId ? { ...account, ...data.socialAccount! } : account
        )
      );

      setEditingAccountId(null);
      setEditingDisplayName("");
      setSuccessMessage("Visningsnavn oppdatert.");
    } catch {
      setError("Noe gikk galt da visningsnavnet skulle oppdateres.");
    } finally {
      setSavingDisplayNameId(null);
    }
  }

  function openDeleteModal(account: SocialAccount) {
    setError("");
    setSuccessMessage("");

    if (!canDeleteAccounts) {
      setError("Kun owner kan slette tracked accounts.");
      return;
    }

    if (accounts.length <= 1) {
      setError("Du kan ikke slette den eneste aktive kontoen i workspace-et.");
      return;
    }

    setDeleteModalAccount(account);
  }

  function closeDeleteModal() {
    if (deletingId) return;
    setDeleteModalAccount(null);
  }

  async function handleConfirmDelete() {
    if (!deleteModalAccount) return;

    setError("");
    setSuccessMessage("");

    try {
      setDeletingId(deleteModalAccount.id);

      const headers = await getAuthHeaders(false);

      const response = await fetch(
        `${API_URL}/social-accounts/${deleteModalAccount.id}`,
        {
          method: "DELETE",
          headers,
        }
      );

      const data: DeleteSocialAccountResponse = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunne ikke fjerne konto.");
        return;
      }

      setAccounts((prev) =>
        prev.filter((account) => account.id !== deleteModalAccount.id)
      );
      setSuccessMessage("Konto fjernet.");
      setDeleteModalAccount(null);
    } catch {
      setError("Noe gikk galt da kontoen skulle fjernes.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetry(account: SocialAccount, jobType: RetryableJobType) {
    setError("");
    setSuccessMessage("");

    if (!canRetryFailedScrapes) {
      setError("Kun owner eller admin kan restarte feilet scraping.");
      return;
    }

    const retryKey = `${account.id}:${jobType}`;

    try {
      setRetryingKey(retryKey);

      const headers = await getAuthHeaders();

      const response = await fetch(`${API_URL}/social-accounts/${account.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jobType,
        }),
      });

      const data: RetryScrapeResponse = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunne ikke restarte scraping.");
        return;
      }

      setAccounts((prev) =>
        prev.map((item) => {
          if (item.id !== account.id) {
            return item;
          }

          if (jobType === "INITIAL") {
            return {
              ...item,
              initialSyncStatus: "PENDING" as const,
              latestInitialJob: data.retry?.queuedJob ?? {
                id: `temp-initial-${item.id}`,
                type: "INITIAL",
                status: "PENDING",
                errorMessage: null,
                createdAt: new Date().toISOString(),
                startedAt: null,
                finishedAt: null,
              },
              retry: {
                ...item.retry,
                canRetryInitial: false,
              },
            };
          }

          return {
            ...item,
            latestDailyJob: data.retry?.queuedJob ?? {
              id: `temp-daily-${item.id}`,
              type: "DAILY",
              status: "PENDING",
              errorMessage: null,
              createdAt: new Date().toISOString(),
              startedAt: null,
              finishedAt: null,
            },
            retry: {
              ...item.retry,
              canRetryDaily: false,
            },
          };
        })
      );

      setSuccessMessage(
        jobType === "INITIAL"
          ? "Initial scraping er startet på nytt."
          : "Daglig data-innhenting er startet på nytt."
      );

      await refreshAccounts();
    } catch {
      setError("Noe gikk galt da scraping skulle restartes.");
    } finally {
      setRetryingKey(null);
    }
  }

  return (
    <>
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
              Kontoer du tracker
            </h2>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Legg til TikTok- og Instagram-kontoer du vil følge i dashboardet.
            </p>
          </div>

          <div
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            <span
              className="font-medium"
              style={{ color: "var(--color-text)" }}
            >
              {activeWorkspaceName}
            </span>
            <span>Rolle: {role ?? "Ukjent"}</span>
            <span>
              Lagt til siste 30 dager:{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {addsThisPeriod} / {monthlyAddLimit}
              </span>
            </span>
            <span>
              Aktive kontoer nå:{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {accounts.length}
              </span>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-3">
            <label
              className="flex flex-col gap-2 text-sm"
              style={{ color: "var(--color-text)" }}
            >
              <span className="font-medium">Plattform</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as Platform)}
                disabled={!canActuallyAdd}
                className="rounded-xl border px-4 py-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="TIKTOK">TikTok</option>
                <option value="INSTAGRAM">Instagram</option>
              </select>
            </label>

            <label
              className="flex flex-col gap-2 text-sm"
              style={{ color: "var(--color-text)" }}
            >
              <span className="font-medium">Brukernavn eller profil-lenke</span>
              <input
                value={accountInput}
                onChange={(event) => setAccountInput(event.target.value)}
                placeholder={
                  platform === "TIKTOK"
                    ? "@brukernavn eller TikTok-lenke"
                    : "@brukernavn eller Instagram-lenke"
                }
                disabled={!canActuallyAdd}
                className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
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
              <span className="font-medium">Visningsnavn (valgfritt)</span>
              <input
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setDisplayNameTouched(true);
                }}
                placeholder="F.eks. MinKonto123"
                disabled={!canActuallyAdd}
                className="rounded-xl border px-4 py-3 outline-none transition placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
            </label>

            <div className="lg:col-span-3 flex flex-col gap-3">
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface-soft)",
                  color: "var(--color-text-soft)",
                }}
              >
                {!canActuallyAdd ? (
                  <>
                    Dette workspace-et har nådd maks antall nye kontoer de siste 30
                    dagene.
                    {typeof daysUntilNextAdd === "number" && nextAddDateLabel ? (
                      <>
                        {" "}
                        Du kan legge til ny konto igjen om{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          {daysUntilNextAdd} dag{daysUntilNextAdd === 1 ? "" : "er"}
                        </span>{" "}
                        ({nextAddDateLabel}).
                      </>
                    ) : (
                      <> Du må vente til en ny periode åpner seg.</>
                    )}
                  </>
                ) : parsedHandle ? (
                  <>
                    Kontoen lagres som{" "}
                    <span
                      className="font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      {parsedHandle}
                    </span>{" "}
                    på {getPlatformLabel(platform)}. Profil-lenke blir{" "}
                    <span
                      className="font-semibold break-all"
                      style={{ color: "var(--color-text)" }}
                    >
                      {previewProfileUrl}
                    </span>
                    . Visningsnavn er fylt inn automatisk, men kan endres.
                  </>
                ) : (
                  "Skriv inn brukernavn eller lim inn en profil-lenke."
                )}
              </div>

              {error ? (
                <div
                  className="rounded-xl border px-4 py-3 text-sm"
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
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: "var(--color-success-bg)",
                    backgroundColor: "var(--color-success-bg)",
                    color: "var(--color-success-text)",
                  }}
                >
                  {successMessage}
                </div>
              ) : null}

              <div className="flex justify-start">
                <button
                  type="submit"
                  disabled={submitting || !canActuallyAdd}
                  className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--color-accent)",
                  }}
                >
                  {submitting ? "Lagrer..." : "Legg til konto"}
                </button>
              </div>
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
          <div className="flex items-center justify-between">
            <h3
              className="text-xl font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Kontoene dine
            </h3>
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>
              {accounts.length} aktive kontoer
            </span>
          </div>

          {accounts.length === 0 ? (
            <div
              className="mt-5 rounded-xl border border-dashed px-6 py-10 text-center"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-soft)",
              }}
            >
              <p
                className="text-base font-medium"
                style={{ color: "var(--color-text)" }}
              >
                Ingen kontoer lagt til ennå
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
                Legg til din første TikTok- eller Instagram-konto over.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      className="border-b px-4 py-3 text-left font-medium"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Plattform
                    </th>
                    <th
                      className="border-b px-4 py-3 text-left font-medium"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Konto
                    </th>
                    <th
                      className="border-b px-4 py-3 text-left font-medium"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Status
                    </th>
                    <th
                      className="border-b px-4 py-3 text-left font-medium"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Lenke
                    </th>
                    <th
                      className="border-b px-4 py-3 text-right font-medium"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Handling
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {accounts.map((account) => {
                    const isEditing = editingAccountId === account.id;
                    const isSaving = savingDisplayNameId === account.id;
                    const initialRetryKey = `${account.id}:INITIAL`;
                    const dailyRetryKey = `${account.id}:DAILY`;

                    return (
                      <tr key={account.id}>
                        <td
                          className="border-b px-4 py-4 text-left align-top"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <span
                            className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold"
                            style={{
                              backgroundColor: "var(--color-accent-soft)",
                              color: "var(--color-accent)",
                            }}
                          >
                            {getPlatformLabel(account.platform)}
                          </span>
                        </td>

                        <td
                          className="border-b px-4 py-4 text-left align-top"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <div className="flex flex-col gap-2">
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  value={editingDisplayName}
                                  onChange={(event) =>
                                    setEditingDisplayName(event.target.value)
                                  }
                                  placeholder={`@${account.accountHandle}`}
                                  disabled={isSaving}
                                  className="rounded-xl border px-3 py-2 outline-none transition placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    borderColor: "var(--color-border)",
                                    backgroundColor: "var(--color-surface)",
                                    color: "var(--color-text)",
                                  }}
                                />

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveDisplayName(account.id)}
                                    disabled={isSaving}
                                    className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                                    style={{
                                      backgroundColor: "var(--color-text)",
                                    }}
                                  >
                                    {isSaving ? "Lagrer..." : "Lagre"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={cancelEditingDisplayName}
                                    disabled={isSaving}
                                    className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                    style={{
                                      borderColor: "var(--color-border)",
                                      backgroundColor: "var(--color-surface)",
                                      color: "var(--color-text)",
                                    }}
                                  >
                                    Avbryt
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span
                                  className="font-semibold"
                                  style={{ color: "var(--color-text)" }}
                                >
                                  {getAccountLabel(account)}
                                </span>
                                <span style={{ color: "var(--color-muted)" }}>
                                  @{account.accountHandle}
                                </span>

                                {canEditDisplayName ? (
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() => startEditingDisplayName(account)}
                                      className="inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
                                      style={{
                                        borderColor: "var(--color-border)",
                                        backgroundColor: "var(--color-surface)",
                                        color: "var(--color-text)",
                                      }}
                                    >
                                      Rediger navn
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </td>

                        <td
                          className="border-b px-4 py-4 text-left align-top"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <span
                                className="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--color-muted)" }}
                              >
                                Initial scraping
                              </span>
                              <div className="flex flex-col gap-2">
                                <span
                                  className={[
                                    "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold",
                                    getInitialSyncBadgeClasses(account.initialSyncStatus),
                                  ].join(" ")}
                                >
                                  {getInitialSyncLabel(account.initialSyncStatus)}
                                </span>

                                {account.retry.canRetryInitial && canRetryFailedScrapes ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRetry(account, "INITIAL")}
                                    disabled={retryingKey === initialRetryKey}
                                    className="inline-flex w-fit items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                    style={{
                                      borderColor: "var(--color-border)",
                                      backgroundColor: "var(--color-surface)",
                                      color: "var(--color-text)",
                                    }}
                                  >
                                    {retryingKey === initialRetryKey
                                      ? "Starter..."
                                      : "Prøv igjen"}
                                  </button>
                                ) : null}

                                {account.latestInitialJob?.status === "FAILED" &&
                                account.latestInitialJob.errorMessage ? (
                                  <p
                                    className="max-w-[260px] text-xs leading-5"
                                    style={{ color: "var(--color-muted)" }}
                                  >
                                    {account.latestInitialJob.errorMessage}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col gap-1">
                              <span
                                className="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--color-muted)" }}
                              >
                                Siste daglige data-innhenting
                              </span>
                              <div className="flex flex-col gap-2">
                                {account.latestDailyJob ? (
                                  <>
                                    <span
                                      className={[
                                        "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold",
                                        getJobBadgeClasses(account.latestDailyJob.status),
                                      ].join(" ")}
                                    >
                                      {getJobStatusLabel(account.latestDailyJob.status)}
                                    </span>

                                    {account.retry.canRetryDaily && canRetryFailedScrapes ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRetry(account, "DAILY")}
                                        disabled={retryingKey === dailyRetryKey}
                                        className="inline-flex w-fit items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                        style={{
                                          borderColor: "var(--color-border)",
                                          backgroundColor: "var(--color-surface)",
                                          color: "var(--color-text)",
                                        }}
                                      >
                                        {retryingKey === dailyRetryKey
                                          ? "Starter..."
                                          : "Prøv igjen"}
                                      </button>
                                    ) : null}

                                    {account.latestDailyJob.status === "FAILED" &&
                                    account.latestDailyJob.errorMessage ? (
                                      <p
                                        className="max-w-[260px] text-xs leading-5"
                                        style={{ color: "var(--color-muted)" }}
                                      >
                                        {account.latestDailyJob.errorMessage}
                                      </p>
                                    ) : null}
                                  </>
                                ) : (
                                  <span style={{ color: "var(--color-muted)" }}>
                                    Ikke kjørt ennå
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          className="border-b px-4 py-4 text-left align-top"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          {account.profileUrl ? (
                            <a
                              href={account.profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium underline underline-offset-4"
                              style={{ color: "var(--color-text)" }}
                            >
                              Åpne profil
                            </a>
                          ) : (
                            <span style={{ color: "var(--color-muted)" }}>
                              Ingen lenke
                            </span>
                          )}
                        </td>

                        <td
                          className="border-b px-4 py-4 text-right align-top"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <button
                            type="button"
                            onClick={() => openDeleteModal(account)}
                            disabled={!canDeleteAny || deletingId === account.id}
                            className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              borderColor: "var(--color-border)",
                              backgroundColor: "var(--color-surface)",
                              color: "var(--color-text)",
                            }}
                          >
                            {deletingId === account.id ? "Fjerner..." : "Fjern"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {deleteModalAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <div
            className="w-full max-w-lg rounded-[24px] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
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
                Slette tracked konto?
              </h3>
              <p
                className="text-sm leading-7"
                style={{ color: "var(--color-text-soft)" }}
              >
                Du er i ferd med å fjerne{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  {getAccountLabel(deleteModalAccount)}
                </span>
                . Dette stopper videre tracking for denne kontoen i workspace-et.
              </p>
              <p
                className="text-sm leading-7"
                style={{ color: "var(--color-text-soft)" }}
              >
                Dersom du legger den til igjen senere, vil det telle som en ny konto
                i 30-dagersgrensen og starte en ny initial scrape.
              </p>
            </div>

            <div
              className="mt-5 rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--color-danger-bg)",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
              }}
            >
              Dette kan ikke angres direkte, og det er derfor lagt bak en ekstra
              bekreftelse.
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                Avbryt
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: "#dc2626",
                }}
              >
                {deletingId ? "Sletter..." : "Ja, slett konto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}