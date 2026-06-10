"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

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

function AccountTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition",
        active ? "text-white shadow-sm" : "hover:opacity-80",
      ].join(" ")}
      style={
        active
          ? {
              backgroundColor: "var(--color-accent)",
            }
          : {
              color: "var(--color-text-soft)",
              backgroundColor: "transparent",
            }
      }
    >
      {label}
    </Link>
  );
}

export default function AccountTabs({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationItem[];
  activeOrganizationId: string | null;
}) {
  const pathname = usePathname();

  return (
    <div
      className="rounded-xl border p-1"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <WorkspaceSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
        />

        <div
          className="hidden h-7 w-px sm:block"
          style={{ backgroundColor: "var(--color-border)" }}
        />

        <div className="flex flex-wrap items-center gap-1">
          <AccountTab
            href="/account/tracked-accounts"
            label="Kontoer du tracker"
            active={pathname === "/account/tracked-accounts"}
          />
          <AccountTab
            href="/account/profile"
            label="Min konto"
            active={pathname === "/account/profile"}
          />
          <AccountTab
            href="/account/workspace-settings"
            label="Workspace-innstillinger"
            active={pathname === "/account/workspace-settings"}
          />
          <AccountTab
            href="/account/contact"
            label="Kontakt"
            active={pathname === "/account/contact"}
          />
        </div>
      </div>
    </div>
  );
}
