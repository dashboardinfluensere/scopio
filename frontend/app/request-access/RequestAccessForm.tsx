"use client";

import { useState } from "react";

type Props = {
  defaultEmail: string;
  requestStatus: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | null;
};

type FormState = {
  note: string;
};

export default function RequestAccessForm({
  defaultEmail,
  requestStatus,
}: Props) {
  const [form, setForm] = useState<FormState>({
    note: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (requestStatus === "PENDING") {
      return;
    }

    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: form.note.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kunne ikke sende forespørselen.");
      }

      setSuccessMessage("Forespørselen er sendt.");
      setForm({
        note: "",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Noe gikk galt. Prøv igjen.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLocked = requestStatus === "PENDING";

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-[#0F172A]"
        >
          E-post
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={defaultEmail}
          readOnly
          aria-readonly="true"
          className="h-12 w-full cursor-not-allowed rounded-xl border border-[#CBD5E1] bg-[#F1F5F9] px-4 text-sm text-[#475569] outline-none"
        />
        <p className="mt-2 text-xs leading-5 text-[#64748B]">
          Denne e-posten er hentet fra kontoen du er logget inn med og kan ikke
          endres her.
        </p>
      </div>

      <div>
        <label
          htmlFor="note"
          className="mb-2 block text-sm font-medium text-[#0F172A]"
        >
          Kort kommentar
        </label>
        <textarea
          id="note"
          name="note"
          rows={5}
          value={form.note}
          onChange={(e) => updateField("note", e.target.value)}
          placeholder="Skriv kort hva du ønsker å bruke Scopio til."
          disabled={isLocked || isSubmitting}
          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#FF6A3D] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#64748B]"
        />
      </div>

      {requestStatus === "PENDING" ? (
        <div className="rounded-xl border border-[#FED7C9] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
          Du har allerede en forespørsel som venter på behandling.
        </div>
      ) : null}

      {requestStatus === "REJECTED" ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          Den forrige forespørselen ble avslått. Du kan sende inn en ny.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
          {successMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || isLocked}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#FF6A3D] px-6 text-sm font-semibold text-white transition hover:bg-[#FF5A2A] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLocked
          ? "Forespørsel sendt"
          : isSubmitting
          ? "Sender..."
          : "Send forespørsel"}
      </button>
    </form>
  );
}