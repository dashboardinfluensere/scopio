"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
        active
          ? "text-white shadow-sm"
          : "hover:opacity-80",
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

export default function AccountTabs() {
  const pathname = usePathname();

  return (
    <div
      className="rounded-xl border p-1"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
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
      </div>
    </div>
  );
}