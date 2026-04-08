"use client";

import { useEffect, useMemo, useState } from "react";

type AccessRequestItem = {
  id: string;
  email: string;
  workspaceName: string;
  selectedPlan: "PRO" | "BUSINESS";
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

type AdminLogItem = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  organizationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  initialAccessRequests: AccessRequestItem[];
};

function formatActionLabel(action: string) {
  switch (action) {
    case "ACCESS_REQUEST_CREATED":
      return "Tilgangsforespørsel opprettet";
    case "ACCESS_REQUEST_UPDATED":
      return "Tilgangsforespørsel oppdatert";
    case "ACCESS_REQUEST_APPROVED":
      return "Tilgangsforespørsel godkjent";
    case "ACCESS_REQUEST_REJECTED":
      return "Tilgangsforespørsel avslått";
    case "ORGANIZATION_CREATED":
      return "Workspace opprettet";
    case "ORGANIZATION_CREATED_AFTER_APPROVAL":
      return "Workspace opprettet etter godkjenning";
    case "ORGANIZATION_UPGRADED":
      return "Workspace oppgradert";
    case "ORGANIZATION_RENAMED":
      return "Workspace endret navn";
    case "ORGANIZATION_PASSWORD_UPDATED":
      return "Workspace-passord oppdatert";
    case "ORGANIZATION_JOINED":
      return "Bruker ble med i workspace";
    case "ORGANIZATION_MEMBER_ROLE_UPDATED":
      return "Medlemsrolle oppdatert";
    case "ORGANIZATION_MEMBER_REMOVED":
      return "Medlem fjernet";
    case "ORGANIZATION_DELETED":
      return "Workspace slettet";
    case "ACTIVE_ORGANIZATION_SET":
      return "Aktivt workspace byttet";
    case "ACCESS_REQUEST_CREATED_FROM_ORGANIZATION_FLOW":
      return "Tilgangsforespørsel opprettet fra workspace-flyt";
    case "ACCESS_REQUEST_UPDATED_FROM_ORGANIZATION_FLOW":
      return "Tilgangsforespørsel oppdatert fra workspace-flyt";
    default:
      return action;
  }
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Ukjent verdi";
  }
}

export default function AccessRequestsTable({
  initialAccessRequests,
}: Props) {
  const [items, setItems] = useState(initialAccessRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === "PENDING"),
    [items]
  );

  const completedItems = useMemo(
    () => items.filter((item) => item.status !== "PENDING"),
    [items]
  );

  async function loadLogs() {
    try {
      setLogsLoading(true);
      setLogsError("");

      const res = await fetch("/api/admin/logs?limit=100", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Kunne ikke hente admin-logger.");
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      setLogsError(
        err instanceof Error ? err.message : "Kunne ikke hente admin-logger."
      );
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  async function handleAction(
    accessRequestId: string,
    action: "approve" | "reject"
  ) {
    setBusyId(accessRequestId);
    setError("");

    try {
      const res = await fetch(
        `/api/admin/access-requests/${accessRequestId}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Kunne ikke oppdatere forespørselen.");
      }

      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== accessRequestId) return item;

          return {
            ...item,
            status: action === "approve" ? "APPROVED" : "REJECTED",
            reviewedAt: new Date().toISOString(),
          };
        })
      );

      await loadLogs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Noe gikk galt. Prøv igjen."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Venter på behandling</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              {pendingItems.length} forespørsel{pendingItems.length === 1 ? "" : "er"}
            </p>
          </div>
        </div>

        {pendingItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FCFDFE] px-4 py-8 text-sm text-[#64748B]">
            Ingen pending forespørsler akkurat nå.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingItems.map((item) => {
              const isBusy = busyId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5"
                >
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {item.user.name || item.email}
                      </p>
                      <p className="mt-1 text-sm text-[#64748B]">{item.email}</p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[#64748B]">
                            Status
                          </p>
                          <p className="mt-1 text-sm font-medium text-[#0F172A]">
                            {item.status}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-[#64748B]">
                            Sendt
                          </p>
                          <p className="mt-1 text-sm font-medium text-[#0F172A]">
                            {new Date(item.createdAt).toLocaleString("no-NO")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">
                        Kommentar
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#0F172A]">
                        {item.note?.trim() ? item.note : "Ingen kommentar sendt inn."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAction(item.id, "approve")}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6A3D] px-4 text-sm font-semibold text-white transition hover:bg-[#FF5A2A] disabled:opacity-60"
                    >
                      {isBusy ? "Jobber..." : "Godkjenn"}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAction(item.id, "reject")}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC] disabled:opacity-60"
                    >
                      Avslå
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">Behandlede forespørsler</h2>
        </div>

        {completedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FCFDFE] px-4 py-8 text-sm text-[#64748B]">
            Ingen behandlede forespørsler ennå.
          </div>
        ) : (
          <div className="space-y-4">
            {completedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5"
              >
                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {item.user.name || item.email}
                    </p>
                    <p className="mt-1 text-sm text-[#64748B]">{item.email}</p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[#64748B]">
                          Status
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#0F172A]">
                          {item.status}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-[#64748B]">
                          Sendt
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#0F172A]">
                          {new Date(item.createdAt).toLocaleString("no-NO")}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-[#64748B]">
                          Behandlet
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#0F172A]">
                          {item.reviewedAt
                            ? new Date(item.reviewedAt).toLocaleString("no-NO")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-[#64748B]">
                      Kommentar
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#0F172A]">
                      {item.note?.trim() ? item.note : "Ingen kommentar sendt inn."}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Admin-logg</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Siste handlinger i systemet.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC] disabled:opacity-60"
            disabled={logsLoading}
          >
            {logsLoading ? "Laster..." : "Oppdater"}
          </button>
        </div>

        {logsError ? (
          <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {logsError}
          </div>
        ) : logsLoading ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FCFDFE] px-4 py-8 text-sm text-[#64748B]">
            Laster admin-logg...
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FCFDFE] px-4 py-8 text-sm text-[#64748B]">
            Ingen logger funnet ennå.
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => {
              const metadataEntries = log.metadata
                ? Object.entries(log.metadata)
                : [];

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {formatActionLabel(log.action)}
                      </p>
                      <p className="mt-1 text-sm text-[#64748B]">
                        {log.actorEmail || "Ukjent bruker"}
                      </p>
                    </div>

                    <div className="text-sm text-[#64748B]">
                      {new Date(log.createdAt).toLocaleString("no-NO")}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">
                        Action
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#0F172A]">
                        {log.action}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">
                        Target type
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#0F172A]">
                        {log.targetType || "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">
                        Organization
                      </p>
                      <p className="mt-1 break-all text-sm font-medium text-[#0F172A]">
                        {log.organizationId || "—"}
                      </p>
                    </div>
                  </div>

                  {metadataEntries.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-xs uppercase tracking-wide text-[#64748B]">
                        Metadata
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {metadataEntries.map(([key, value]) => (
                          <div key={key}>
                            <p className="text-xs uppercase tracking-wide text-[#64748B]">
                              {key}
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[#0F172A]">
                              {formatMetadataValue(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}