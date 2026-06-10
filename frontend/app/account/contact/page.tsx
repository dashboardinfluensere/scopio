import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="grid gap-6">
      <section
        className="rounded-xl border p-6 shadow-sm"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex flex-col gap-2">
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Kontakt
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Har du spørsmål, problemer eller tilbakemeldinger om Scopio?
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--color-muted)" }}
            >
              E-post
            </p>
            <a
              href="mailto:Dmytro@Maliarchuk.no"
              className="mt-2 inline-block text-base font-semibold transition hover:opacity-80"
              style={{ color: "var(--color-text)" }}
            >
              Dmytro@Maliarchuk.no
            </a>
            <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
              Send gjerne med hvilken workspace det gjelder, og hva du prøvde å gjøre.
            </p>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--color-muted)" }}
            >
              Retningslinjer
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/terms-of-service"
                className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                Brukervilkår
              </Link>
              <Link
                href="/privacy-policy"
                className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                Personvern
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
