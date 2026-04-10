"use client";

import { useClerk } from "@clerk/nextjs";

export default function RequestAccessBackButton() {
  const { signOut } = useClerk();

  async function handleClick() {
    await signOut({
      redirectUrl: "/",
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-sm font-medium text-[#64748B] transition hover:text-[#0F172A]"
    >
      Logg ut og gå tilbake
    </button>
  );
}