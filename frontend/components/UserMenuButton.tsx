import Link from "next/link";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      <path d="M5 19.2a7 7 0 0 1 14 0" />
    </svg>
  );
}

export default function UserMenuButton() {
  return (
    <Link
      href="/account/tracked-accounts"
      aria-label="Åpne konto-innstillinger"
      title="Min konto"
      className="inline-flex h-12 w-12 items-center justify-center rounded-full border transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#FF6A3D] focus:ring-offset-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text)",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
      }}
    >
      <UserIcon />
    </Link>
  );
}