"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getClientApiUrl } from "../lib/api";

type Platform = "TIKTOK" | "INSTAGRAM";

type ExistingAccount = {
  id: string;
  platform: string;
  accountHandle: string;
  displayName: string | null;
  initialSyncStatus?: string;
};

type PollAccount = {
  id: string;
  platform: string;
  accountHandle: string;
  displayName: string | null;
  initialSyncStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  status: string;
  createdAt: string;
};

type PollResponse = {
  ok: boolean;
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    failed: number;
    hasAtLeastOneCompleted: boolean;
    hasFailures: boolean;
    allFinished: boolean;
    allFailed: boolean;
    isQuotaBlocked: boolean;
    quotaBlockedUntil: string | null;
    allPendingWhileQuotaBlocked: boolean;
  };
  accounts: PollAccount[];
};

type PendingAccount = {
  id: string;
  platform: Platform;
  accountHandle: string;
  displayName: string;
};

type Props = {
  isRequired: boolean;
  isInitialScrapeRunning: boolean;
  accountLimit: number;
  canAddAccounts: boolean;
  existingAccounts: ExistingAccount[];
};

const API_URL = getClientApiUrl();

const WAITING_QUOTES = [
  "Scopio henter inn dataene dine.",
  "Kobler kontoer og gjør dashboardet klart.",
  "Henter poster fra de siste 90 dagene.",
  "Analyserer tall og bygger første oversikt.",
  "Mens du venter: god data tar litt tid, men det er verdt det.",
];

function getPlatformLabel(platform: string) {
  return platform === "INSTAGRAM" ? "Instagram" : "TikTok";
}

function normalizePreviewHandle(input: string) {
  return input.trim().replace(/^@/, "");
}

function getEstimatedTimeLabel(count: number) {
  if (count <= 1) return "Ca. 1–2 min";
  if (count <= 3) return "Ca. 2–4 min";
  if (count <= 8) return "Ca. 4–6 min";
  return "Noen få minutter";
}

function getStatusPill(status: string) {
  if (status === "COMPLETED") {
    return "bg-[#ECFDF3] text-[#027A48]";
  }

  if (status === "FAILED") {
    return "bg-[#FEF3F2] text-[#B42318]";
  }

  if (status === "RUNNING") {
    return "bg-[#FFF4EF] text-[#C2410C]";
  }

  return "bg-[#F8FAFC] text-[#475467]";
}

function formatBlockedUntil(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InitialAccountOnboarding({
  isRequired,
  isInitialScrapeRunning,
  accountLimit,
  canAddAccounts,
  existingAccounts,
}: Props) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [step, setStep] = useState<"collect" | "waiting" | "failed">(
    isInitialScrapeRunning ? "waiting" : "collect"
  );
  const [platform, setPlatform] = useState<Platform>("TIKTOK");
  const [accountHandle, setAccountHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[]>([]);
  const [pollData, setPollData] = useState<PollResponse | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);

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

  useEffect(() => {
    setStep(isInitialScrapeRunning ? "waiting" : "collect");
  }, [isInitialScrapeRunning]);

  useEffect(() => {
    if (!isRequired && !isInitialScrapeRunning) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isRequired, isInitialScrapeRunning]);

  useEffect(() => {
    if (step !== "waiting") return;

    const quoteTimer = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % WAITING_QUOTES.length);
    }, 3500);

    return () => window.clearInterval(quoteTimer);
  }, [step]);

  useEffect(() => {
    if (step !== "waiting") return;

    let cancelled = false;

    async function poll() {
      try {
        const headers = await getAuthHeaders(false);

        const res = await fetch(`${API_URL}/social-accounts/initial-sync-status`, {
          cache: "no-store",
          headers,
        });

        const data = (await res.json()) as PollResponse;

        if (!res.ok || !data.ok) {
          throw new Error("Kunne ikke hente initial sync-status");
        }

        if (cancelled) return;

        setPollData(data);

        if (data.summary.hasAtLeastOneCompleted) {
          router.refresh();
          return;
        }

        if (
          data.summary.allFailed ||
          data.summary.isQuotaBlocked ||
          data.summary.allPendingWhileQuotaBlocked
        ) {
          setStep("failed");
          return;
        }
      } catch {
        if (cancelled) return;
      }
    }

    poll();
    const interval = window.setInterval(poll, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [router, step, getToken]);

  const accountsForWaitingView = useMemo(() => {
    if (pollData?.accounts?.length) {
      return pollData.accounts;
    }

    return existingAccounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      accountHandle: account.accountHandle,
      displayName: account.displayName,
      initialSyncStatus:
        (account.initialSyncStatus as
          | "PENDING"
          | "RUNNING"
          | "COMPLETED"
          | "FAILED") || "PENDING",
      status: "ACTIVE",
      createdAt: "",
    }));
  }, [existingAccounts, pollData]);

  const usedCount = existingAccounts.length + pendingAccounts.length;
  const remainingCount = Math.max(accountLimit - usedCount, 0);
  const doneDisabled =
    isSubmitting ||
    !canAddAccounts ||
    pendingAccounts.length === 0 ||
    usedCount > accountLimit;

  if (!isRequired && !isInitialScrapeRunning) {
    return null;
  }

  function handleAddAccount() {
    setError("");
    setSubmitError("");

    const cleanedHandle = normalizePreviewHandle(accountHandle);

    if (!cleanedHandle) {
      setError("Skriv inn et brukernavn eller en profil-lenke.");
      return;
    }

    if (!canAddAccounts) {
      setError("Workspace har ikke tilgang til å legge til kontoer akkurat nå.");
      return;
    }

    if (usedCount >= accountLimit) {
      setError(`Du har nådd maks antall kontoer for planen din (${accountLimit}).`);
      return;
    }

    const duplicateInPending = pendingAccounts.some(
      (item) =>
        item.platform === platform &&
        normalizePreviewHandle(item.accountHandle).toLowerCase() ===
          cleanedHandle.toLowerCase()
    );

    const duplicateExisting = existingAccounts.some(
      (item) =>
        item.platform === platform &&
        item.accountHandle.toLowerCase() === cleanedHandle.toLowerCase()
    );

    if (duplicateInPending || duplicateExisting) {
      setError("Denne kontoen er allerede lagt til.");
      return;
    }

    setPendingAccounts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        platform,
        accountHandle: cleanedHandle,
        displayName: displayName.trim(),
      },
    ]);

    setAccountHandle("");
    setDisplayName("");
  }

  function handleRemovePendingAccount(id: string) {
    setPendingAccounts((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSubmitInitialAccounts() {
    setSubmitError("");
    setError("");
    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();

      const res = await fetch(`${API_URL}/social-accounts/initial-submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          accounts: pendingAccounts.map((item) => ({
            platform: item.platform,
            accountHandle: item.accountHandle,
            displayName: item.displayName || undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Kunne ikke starte initial scrape");
      }

      setStep("waiting");
      setPendingAccounts([]);
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Noe gikk galt da initial scrape skulle starte."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContinueToDashboard() {
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-5xl rounded-[28px] border border-[#E5E7EB] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.20)]">
        {step === "collect" ? (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <div className="inline-flex items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-4 py-2 text-sm font-medium text-[#C2410C]">
                Førstegangsoppsett
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0F172A] md:text-4xl">
                Legg til kontoene du vil tracke
              </h2>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#475467]">
                Velg TikTok- og Instagram-kontoer du vil sette opp i Scopio. Du kan
                legge til, fjerne eller bytte kontoer senere også. Når du trykker{" "}
                <span className="font-semibold text-[#0F172A]">Ferdig</span>, starter
                vi innhentingen av de siste 90 dagene.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[#0F172A]">
                      Kontoer klare for oppstart
                    </p>
                    <p className="mt-1 text-sm text-[#667085]">
                      Legg til én eller flere kontoer før du går videre.
                    </p>
                  </div>

                  <div className="rounded-full bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#344054]">
                    {usedCount} / {accountLimit} brukt
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#EEF2F7] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">Konto-limit</p>
                      <p className="mt-1 text-xs text-[#667085]">
                        {remainingCount} ledige plasser igjen på denne planen
                      </p>
                    </div>

                    <span className="rounded-full bg-[#FFF4EF] px-3 py-1 text-xs font-semibold text-[#C2410C]">
                      {getEstimatedTimeLabel(pendingAccounts.length || 1)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {pendingAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#D0D5DD] bg-white p-5 text-sm text-[#667085]">
                      Ingen kontoer lagt til enda.
                    </div>
                  ) : (
                    pendingAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[#101828]">
                              {account.displayName.trim()
                                ? account.displayName.trim()
                                : `@${account.accountHandle}`}
                            </p>
                            <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#475467]">
                              {getPlatformLabel(account.platform)}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-xs text-[#667085]">
                            @{account.accountHandle}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePendingAccount(account.id)}
                          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#344054] transition hover:bg-[#F8FAFC]"
                        >
                          Fjern
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {submitError ? (
                  <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B42318]">
                    {submitError}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
                <p className="text-lg font-semibold text-[#0F172A]">Legg til konto</p>
                <p className="mt-1 text-sm text-[#667085]">
                  Du kan blande TikTok og Instagram i samme oppsett.
                </p>

                <div className="mt-5 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                      Plattform
                    </span>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as Platform)}
                      className="w-full rounded-xl border border-[#D0D5DD] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none"
                    >
                      <option value="TIKTOK">TikTok</option>
                      <option value="INSTAGRAM">Instagram</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                      Brukernavn eller profil-lenke
                    </span>
                    <input
                      type="text"
                      value={accountHandle}
                      onChange={(e) => setAccountHandle(e.target.value)}
                      placeholder="@brukernavn eller profil-lenke"
                      className="w-full rounded-xl border border-[#D0D5DD] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#0F172A]">
                      Visningsnavn (valgfritt)
                    </span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="F.eks. MinKonto123"
                      className="w-full rounded-xl border border-[#D0D5DD] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none"
                    />
                  </label>

                  {error ? (
                    <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B42318]">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleAddAccount}
                    disabled={!canAddAccounts || usedCount >= accountLimit}
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-[#FF6A3D] px-5 text-sm font-semibold text-white transition hover:bg-[#FF5A2A] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Legg til i listen
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#EAECF0] pt-6 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-[#667085]">
                Initial scrape starter først når du trykker ferdig.
              </p>

              <button
                type="button"
                onClick={handleSubmitInitialAccounts}
                disabled={doneDisabled}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0F172A] px-6 text-sm font-semibold text-white transition hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Starter opp..." : "Ferdig"}
              </button>
            </div>
          </div>
        ) : step === "waiting" ? (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <div className="inline-flex items-center rounded-full border border-[#FED7C9] bg-[#FFF4EF] px-4 py-2 text-sm font-medium text-[#C2410C]">
                Initial scrape kjører
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0F172A] md:text-4xl">
                Scopio henter inn dataene for kontoene du valgte
              </h2>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#475467]">
                Du sendes videre automatisk så snart minst én konto er klar. Resten
                kan fortsette å jobbe i bakgrunnen.
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-sm font-medium text-[#667085]">Status</p>
                    <p className="mt-2 text-xl font-semibold text-[#101828]">
                      {WAITING_QUOTES[quoteIndex]}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-sm font-medium text-[#667085]">Estimert tid</p>
                    <p className="mt-2 text-xl font-semibold text-[#101828]">
                      {getEstimatedTimeLabel(
                        pollData?.summary.total || accountsForWaitingView.length || 1
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-sm font-medium text-[#667085]">Klar så langt</p>
                    <p className="mt-2 text-xl font-semibold text-[#101828]">
                      {pollData?.summary.completed ?? 0} /{" "}
                      {pollData?.summary.total ?? accountsForWaitingView.length}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2F7]">
                        <div
                          className="h-full rounded-full bg-[#FF6A3D] transition-all"
                          style={{
                            width: `${
                              pollData?.summary.total
                                ? Math.max(
                                    8,
                                    (pollData.summary.completed /
                                      pollData.summary.total) *
                                      100
                                  )
                                : 12
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center gap-3 text-sm text-[#475467]">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4EF] text-[#C2410C]">
                          1
                        </span>
                        Kobler kontoer
                      </div>
                      <div className="flex items-center gap-3 text-sm text-[#475467]">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4EF] text-[#C2410C]">
                          2
                        </span>
                        Henter poster
                      </div>
                      <div className="flex items-center gap-3 text-sm text-[#475467]">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4EF] text-[#C2410C]">
                          3
                        </span>
                        Analyserer data
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {accountsForWaitingView.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#101828]">
                            {account.displayName?.trim()
                              ? account.displayName.trim()
                              : `@${account.accountHandle}`}
                          </p>
                          <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#475467]">
                            {getPlatformLabel(account.platform)}
                          </span>
                        </div>

                        <p className="mt-1 truncate text-xs text-[#667085]">
                          @{account.accountHandle}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusPill(
                          account.initialSyncStatus
                        )}`}
                      >
                        {account.initialSyncStatus === "COMPLETED"
                          ? "Klar"
                          : account.initialSyncStatus === "RUNNING"
                            ? "Jobber"
                            : account.initialSyncStatus === "FAILED"
                              ? "Feilet"
                              : "Venter"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
                <p className="text-lg font-semibold text-[#0F172A]">Mens du venter</p>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-4 text-sm text-[#475467]">
                    “Bra dashboards begynner med bra data.”
                  </div>
                  <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-4 text-sm text-[#475467]">
                    “Dette er den kjedelige delen. Den fine delen kommer rett etter.”
                  </div>
                  <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-4 text-sm text-[#475467]">
                    “Når første konto er klar, slipper vi deg inn automatisk.”
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <div className="inline-flex items-center rounded-full border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-medium text-[#B42318]">
                Initial scrape feilet
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0F172A] md:text-4xl">
                Vi kunne ikke hente inn data for kontoene dine
              </h2>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#475467]">
                Initial scrape ble ikke fullført for noen av kontoene. Dette skyldes
                ofte midlertidig feil hos scraping-tjenesten, manglende credits,
                quota-blokkering eller at scraping-featuren er deaktivert.
              </p>
            </div>

            {pollData?.summary.isQuotaBlocked ? (
              <div className="mt-5 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5">
                <p className="text-sm font-semibold text-[#B42318]">
                  Apify-kvoten er brukt opp eller midlertidig blokkert.
                </p>
                <p className="mt-2 text-sm text-[#7A271A]">
                  Scopio får ikke startet scraping akkurat nå fordi scraping-tjenesten
                  er blokkert.{" "}
                  {formatBlockedUntil(pollData.summary.quotaBlockedUntil)
                    ? `Prøv igjen etter ${formatBlockedUntil(
                        pollData.summary.quotaBlockedUntil
                      )}.`
                    : "Prøv igjen senere."}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5">
              <p className="text-sm font-semibold text-[#B42318]">
                Hva kan ha gått galt?
              </p>
              <ul className="mt-3 space-y-2 text-sm text-[#7A271A]">
                <li>• TikTok- eller Instagram-scraping er ikke tilgjengelig akkurat nå</li>
                <li>• Ekstern scraping-tjeneste kan være tom for credits eller tilgang</li>
                <li>• Kontoen kunne ikke behandles av tjenesten</li>
              </ul>
            </div>

            <div className="mt-5 space-y-3">
              {accountsForWaitingView.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#101828]">
                        {account.displayName?.trim()
                          ? account.displayName.trim()
                          : `@${account.accountHandle}`}
                      </p>
                      <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#475467]">
                        {getPlatformLabel(account.platform)}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-xs text-[#667085]">
                      @{account.accountHandle}
                    </p>
                  </div>

                  <span className="rounded-full bg-[#FEF3F2] px-3 py-1 text-xs font-semibold text-[#B42318]">
                    Feilet
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#EAECF0] pt-6 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-[#667085]">
                Du kan gå videre til dashboardet og prøve igjen senere.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-[#D0D5DD] bg-white px-6 text-sm font-semibold text-[#344054] transition hover:bg-[#F9FAFB]"
                >
                  Prøv igjen
                </button>

                <button
                  type="button"
                  onClick={handleContinueToDashboard}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0F172A] px-6 text-sm font-semibold text-white transition hover:bg-[#111827]"
                >
                  Gå til dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}