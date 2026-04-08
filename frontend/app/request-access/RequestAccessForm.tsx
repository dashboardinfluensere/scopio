"use client";

import { useState } from "react";

type Props = {
  defaultName: string;
  defaultEmail: string;
  requestStatus: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | null;
};

type FormState = {
  note: string;
};

export default function RequestAccessForm({
  defaultName,
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

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="name"
          className="mb-2 block text-sm font-medium text-[#0F172A]"
        >
          Navn
        </label>
        <input
          id="name"
          name="name"
          defaultValue={defaultName}
          placeholder="Ditt navn"
          className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F1F5F9] px-4 text-sm outline-none"
          readOnly
        />
      </div>

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
          defaultValue={defaultEmail}
          placeholder="navn@epost.no"
          className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm text-[#475569] outline-none"
          readOnly
        />
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
          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#FF6A3D]"
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
        disabled={isSubmitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#FF6A3D] px-6 text-sm font-semibold text-white transition hover:bg-[#FF5A2A] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Sender..." : "Send forespørsel"}
      </button>
    </form>
  );
}