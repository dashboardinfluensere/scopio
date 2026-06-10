"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientApiUrl } from "../lib/api";
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

const API_URL = getClientApiUrl();

function formatRole(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

export default function WorkspaceSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationItem[];
  activeOrganizationId: string | null;
}) {
  const router = useRouter();
  const authedFetch = useAuthedFetch();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState("");

  const activeWorkspace = useMemo(
    () =>
      organizations.find((item) => item.organization.id === activeOrganizationId) ??
      null,
    [activeOrganizationId, organizations]
  );

  const hasWorkspaces = organizations.length > 0;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function handleChange(nextOrganizationId: string) {
    setError("");
    setIsOpen(false);

    if (!nextOrganizationId || nextOrganizationId === activeOrganizationId) {
      return;
    }

    try {
      setIsSwitching(true);

      const response = await authedFetch(`${API_URL}/organizations/set-active`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: nextOrganizationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Kunne ikke bytte workspace.");
        return;
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Noe gikk galt da workspace skulle byttes."
      );
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isSwitching}
        className="group inline-flex h-10 max-w-[320px] items-center gap-2 rounded-xl border px-3 text-left text-sm transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          borderColor: isOpen
            ? "rgba(255, 106, 61, 0.42)"
            : "var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          boxShadow: isOpen ? "0 8px 24px rgba(15, 23, 42, 0.22)" : "none",
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{
            backgroundColor: "rgba(255, 106, 61, 0.1)",
            color: "var(--color-accent)",
          }}
        >
          Workspace
        </span>

        <span className="min-w-0 max-w-[150px] truncate font-semibold">
          {activeWorkspace?.organization.name ??
            (hasWorkspaces ? "Velg workspace" : "Ingen workspace")}
        </span>

        <span
          aria-hidden="true"
          className="ml-auto text-xs transition group-disabled:opacity-60"
          style={{ color: "var(--color-muted)" }}
        >
          {isSwitching ? "..." : "▾"}
        </span>
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 top-12 z-50 w-[320px] overflow-hidden rounded-xl border p-2 shadow-xl"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            boxShadow: "0 18px 45px rgba(0, 0, 0, 0.28)",
          }}
          role="listbox"
        >
          <div className="px-3 pb-2 pt-1">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-muted)" }}
            >
              Bytt workspace
            </p>
          </div>

          {!hasWorkspaces ? (
            <div
              className="rounded-xl border px-3 py-3 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-soft)",
                color: "var(--color-text-soft)",
              }}
            >
              Ingen workspace funnet. Opprett eller bli med i et workspace under
              Min konto.
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto">
              {organizations.map((item) => {
                const isActive = item.organization.id === activeOrganizationId;

                return (
                  <button
                    key={item.organization.id}
                    type="button"
                    onClick={() => handleChange(item.organization.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition hover:opacity-90"
                    style={{
                      backgroundColor: isActive
                        ? "rgba(255, 106, 61, 0.12)"
                        : "transparent",
                      color: "var(--color-text)",
                    }}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {item.organization.name}
                      </span>
                      <span
                        className="mt-1 block text-xs"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Rolle: {formatRole(item.role)}
                      </span>
                    </span>

                    {isActive ? (
                      <span
                        className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold"
                        style={{
                          backgroundColor: "rgba(255, 106, 61, 0.14)",
                          color: "var(--color-accent)",
                        }}
                      >
                        Aktiv
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p
          className="absolute left-0 top-12 z-50 w-[320px] rounded-xl border px-3 py-2 text-xs shadow-lg"
          style={{
            borderColor: "var(--color-danger-bg)",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-text)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
