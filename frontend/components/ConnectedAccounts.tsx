"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getClientApiUrl } from "../lib/api";

type Mode = "total" | "average";
type Metric = "views" | "likes" | "publishing" | "engagement";
type Period = "7" | "30" | "90" | "custom";
type Platform = "TIKTOK" | "INSTAGRAM";

type SocialAccount = {
  id: string;
  platform: string;
  accountHandle: string;
  displayName: string | null;
  profileUrl: string | null;
  isActive?: boolean;
};

type ConnectedAccountsProps = {
  accounts: SocialAccount[];
  selectedAccountIds: string[];
  mode: Mode;
  metric: Metric;
  period: Period;
  from?: string;
  to?: string;
  tableSearch?: string;
  tableSortBy?: string;
  tableSortOrder?: "asc" | "desc";
  tableView?: "all" | "min";
  accountLimit: number;
  accountsUsed: number;
  accountsRemaining: number;
  canAddAccounts: boolean;
};

const API_URL = getClientApiUrl();

function getPlatformLabel(platform: string) {
  const normalized = platform.toLowerCase();

  if (normalized === "tiktok") return "TikTok";
  if (normalized === "instagram") return "Instagram";

  return platform;
}

function buildHref(paramsInput: {
  accounts: SocialAccount[];
  selectedAccountIds: string[];
  toggledAccountId: string;
  mode: Mode;
  metric: Metric;
  period: Period;
  from?: string;
  to?: string;
  tableSearch?: string;
  tableSortBy?: string;
  tableSortOrder?: "asc" | "desc";
  tableView?: "all" | "min";
}) {
  const {
    accounts,
    selectedAccountIds,
    toggledAccountId,
    mode,
    metric,
    period,
    from,
    to,
    tableSearch,
    tableSortBy,
    tableSortOrder,
    tableView,
  } = paramsInput;

  const current = new Set(selectedAccountIds);
  const next = new Set(selectedAccountIds);

  if (current.has(toggledAccountId)) {
    if (current.size > 1) {
      next.delete(toggledAccountId);
    }
  } else {
    next.add(toggledAccountId);
  }

  const orderedNext = accounts
    .map((account) => account.id)
    .filter((accountId) => next.has(accountId));

  const params = new URLSearchParams();

  params.set("mode", mode);
  params.set("metric", metric);
  params.set("period", period);

  if (period === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }

  orderedNext.forEach((accountId) => {
    params.append("accountIds", accountId);
  });

  if (tableSearch && tableSearch.trim() !== "") {
    params.set("tableSearch", tableSearch.trim());
  }

  if (tableSortBy) {
    params.set("tableSortBy", tableSortBy);
  }

  if (tableSortOrder) {
    params.set("tableSortOrder", tableSortOrder);
  }

  if (tableView) {
    params.set("tableView", tableView);
  }

  return `?${params.toString()}`;
}

export default function ConnectedAccounts({
  accounts,
  selectedAccountIds,
  mode,
  metric,
  period,
  from,
  to,
  tableSearch = "",
  tableSortBy = "publishedAt",
  tableSortOrder = "desc",
  tableView = "min",
  accountLimit,
  accountsUsed,
  accountsRemaining,
  canAddAccounts,
}: ConnectedAccountsProps) {
  const { getToken } = useAuth();

  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("TIKTOK");
  const [accountHandle, setAccountHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  useEffect(() => {
    if (accounts.length === 0) {
      setOpen(true);
    }
  }, [accounts.length]);

  const selectedSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds]
  );
  const selectedCount = accounts.filter((account) =>
    selectedSet.has(account.id)
  ).length;
  const limitReached = accountLimit > 0 && accountsUsed >= accountLimit;

  async function getAuthHeaders() {
    const token = await getToken();

    if (!token) {
      throw new Error("Du er ikke autentisert");
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function handleCreateAccount() {
    setCreateError("");
    setCreateSuccess("");

    if (!accountHandle.trim()) {
      setCreateError("Skriv inn brukernavn eller profil-lenke.");
      return;
    }

    if (!canAddAccounts || limitReached) {
      setCreateError(
        `Du har nådd maks antall nye kontoer for planen din de siste 30 dagene (${accountLimit}).`
      );
      return;
    }

    setCreateLoading(true);

    try {
      const headers = await getAuthHeaders();

      const res = await fetch(`${API_URL}/social-accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          platform,
          accountHandle: accountHandle.trim(),
          displayName: displayName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke legge til konto");
      }

      setCreateSuccess("Konto lagt til. Oppdaterer...");
      setAccountHandle("");
      setDisplayName("");

      window.location.reload();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Noe gikk galt");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
      >
        Kontoer du tracker
        <span className={`text-xs transition ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+12px)] z-30 w-[min(880px,94vw)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_20px_45px_rgba(15,23,42,0.28)]">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
              <div className="mb-4">
                <p className="text-base font-semibold text-[var(--color-text)]">
                  Kontoer du tracker
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {accounts.length === 0
                    ? "Legg til din første TikTok- eller Instagram-konto for å komme i gang."
                    : `Viser ${selectedCount} av ${accounts.length} kontoer`}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      Nye kontoer siste 30 dager
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {accountsUsed} / {accountLimit} brukt
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      limitReached
                        ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
                        : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    }`}
                  >
                    {limitReached ? "Grense nådd" : `${accountsRemaining} ledige`}
                  </span>
                </div>
              </div>

              <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">
                    Ingen kontoer koblet til enda.
                  </div>
                ) : (
                  accounts.map((account) => {
                    const isSelected = selectedSet.has(account.id);
                    const label =
                      account.displayName?.trim() || `@${account.accountHandle}`;
                    const href = buildHref({
                      accounts,
                      selectedAccountIds,
                      toggledAccountId: account.id,
                      mode,
                      metric,
                      period,
                      from,
                      to,
                      tableSearch,
                      tableSortBy,
                      tableSortOrder,
                      tableView,
                    });

                    return (
                      <div
                        key={account.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                              {label}
                            </p>
                            <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-muted)]">
                              {getPlatformLabel(account.platform)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                            @{account.accountHandle}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              isSelected
                                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                : "bg-[var(--color-surface-muted)] text-[var(--color-muted)]"
                            }`}
                          >
                            {isSelected ? "Vises" : "Skjult"}
                          </span>

                          <Link
                            href={href}
                            scroll={false}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                              isSelected
                                ? "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]"
                                : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                            }`}
                          >
                            {isSelected ? "Skjul" : "Vis"}
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4">
                <p className="text-base font-semibold text-[var(--color-text)]">
                  Legg til konto
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Legg til TikTok- og Instagram-kontoer du vil følge i dashboardet.
                </p>
              </div>

              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Plattform
                  </span>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as Platform)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
                  >
                    <option value="TIKTOK">TikTok</option>
                    <option value="INSTAGRAM">Instagram</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Brukernavn eller profil-lenke
                  </span>
                  <input
                    type="text"
                    value={accountHandle}
                    onChange={(e) => setAccountHandle(e.target.value)}
                    placeholder="@brukernavn eller profil-lenke"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Visningsnavn (valgfritt)
                  </span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="F.eks. MinKonto123"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
                  />
                </label>

                {createError ? (
                  <div className="rounded-xl border bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)] [border-color:var(--color-danger-bg)]">
                    {createError}
                  </div>
                ) : null}

                {createSuccess ? (
                  <div className="rounded-xl border bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success-text)] [border-color:var(--color-success-bg)]">
                    {createSuccess}
                  </div>
                ) : null}

                {limitReached ? (
                  <div className="rounded-xl border bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-text)] [border-color:var(--color-warning-bg)]">
                    Du har nådd maks antall nye kontoer de siste 30 dagene. Vent til neste ledige plass, eller oppgrader planen om du vil ha høyere grense.
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleCreateAccount}
                  disabled={createLoading || !canAddAccounts || limitReached}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createLoading ? "Legger til konto..." : "Legg til konto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}