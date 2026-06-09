const sections = [
  {
    title: "1. Hvem er ansvarlig",
    paragraphs: [
      "Scopio drives av Dmytro Maliarchuk.",
      "E-post: Dmytro@Maliarchuk.no",
      "Nettsted: scopio.no",
      "Dmytro Maliarchuk er ansvarlig for behandlingen av personopplysninger som skjer i Scopio.",
    ],
  },
  {
    title: "2. Hvilke opplysninger vi behandler",
    paragraphs: [
      "Scopio kan behandle personopplysninger som er nødvendige for å levere tjenesten.",
      "Dette kan blant annet være:",
    ],
    bullets: [
      "navn",
      "e-postadresse",
      "innloggingsinformasjon",
      "informasjon om brukerprofilen din",
      "hvilket arbeidsområde eller organisasjon du tilhører",
      "sosiale medier-kontoer du legger til i Scopio",
      "statistikk og analysedata knyttet til kontoene du legger inn",
      "teknisk informasjon, som IP-adresse, enhet, nettleser og logger",
      "informasjon om abonnement, betaling og bruk av tjenesten",
    ],
  },
  {
    title: "3. Hvorfor vi behandler opplysningene",
    paragraphs: [
      "Scopio behandler personopplysninger for å kunne levere, sikre og forbedre tjenesten.",
      "Opplysningene kan brukes til å:",
    ],
    bullets: [
      "opprette og administrere brukerkontoen din",
      "gi deg tilgang til riktig arbeidsområde",
      "vise statistikk og analyser i dashboardet",
      "håndtere abonnement, betaling og prøveperiode",
      "gi kundestøtte",
      "forbedre funksjoner og brukeropplevelse",
      "sikre tjenesten mot misbruk, feil og uautorisert tilgang",
      "oppfylle juridiske plikter",
    ],
  },
  {
    title: "4. Sosiale medier-data",
    paragraphs: [
      "Når du legger inn eller kobler til en sosial medier-konto i Scopio, kan Scopio behandle data knyttet til denne kontoen for å vise statistikk, utvikling og analyser.",
      "Du skal kun legge inn kontoer du selv eier, administrerer eller har tydelig tillatelse til å bruke.",
      "Scopio bruker slike data kun for å levere funksjonaliteten i tjenesten til deg og arbeidsområdet ditt.",
    ],
  },
  {
    title: "5. Rettslig grunnlag",
    paragraphs: [
      "Scopio behandler personopplysninger basert på ett eller flere rettslige grunnlag.",
      "Dette kan være:",
    ],
    bullets: [
      "avtale, når behandlingen er nødvendig for å levere tjenesten du har bedt om",
      "samtykke, dersom du aktivt har gitt tillatelse til en bestemt behandling",
      "berettiget interesse, for eksempel for sikkerhet, feilretting og forbedring av tjenesten",
      "rettslig plikt, dersom Scopio må behandle opplysninger for å følge lover og regler",
    ],
  },
  {
    title: "6. Betaling",
    paragraphs: [
      "Dersom du kjøper abonnement eller bruker betalte funksjoner, kan betalingsrelaterte opplysninger behandles for å gjennomføre betaling, fakturering og administrasjon av abonnementet.",
      "Scopio lagrer normalt ikke komplette kortopplysninger selv. Betaling kan håndteres av eksterne betalingsleverandører.",
    ],
  },
  {
    title: "7. Eksterne leverandører",
    paragraphs: [
      "Scopio kan bruke eksterne leverandører for å drifte og levere tjenesten.",
      "Dette kan for eksempel være leverandører for innlogging, hosting, database, betaling, analyse, e-post, sikkerhet og kundestøtte.",
      "Slike leverandører får kun tilgang til opplysninger når det er nødvendig for å levere tjenesten, og skal ikke bruke opplysningene til egne formål.",
    ],
  },
  {
    title: "8. Deling av opplysninger",
    paragraphs: [
      "Scopio selger ikke personopplysningene dine til andre.",
      "Personopplysninger kan deles dersom det er nødvendig for å levere tjenesten, oppfylle en avtale, følge lovpålagte krav eller beskytte Scopio, brukere eller andre mot misbruk og sikkerhetsrisiko.",
    ],
  },
  {
    title: "9. Lagringstid",
    paragraphs: [
      "Scopio lagrer personopplysninger så lenge det er nødvendig for formålene de ble samlet inn for.",
      "Opplysninger kan lagres så lenge du har en konto, et aktivt arbeidsområde eller et abonnement hos Scopio.",
      "Når kontoen eller abonnementet avsluttes, kan opplysninger slettes eller anonymiseres, med mindre Scopio må lagre dem lenger på grunn av lovkrav, sikkerhet, regnskap eller tvisteløsning.",
    ],
  },
  {
    title: "10. Sikkerhet",
    paragraphs: [
      "Scopio skal gjøre rimelige tekniske og organisatoriske tiltak for å beskytte personopplysninger.",
      "Dette kan blant annet inkludere tilgangskontroll, sikker innlogging, logging, begrensning av tilganger og overvåking av mistenkelig aktivitet.",
      "Ingen digital tjeneste er likevel helt risikofri. Du er selv ansvarlig for å beskytte innloggingsinformasjonen din og gi beskjed dersom du oppdager uautorisert bruk.",
    ],
  },
  {
    title: "11. Dine rettigheter",
    paragraphs: [
      "Du har rettigheter knyttet til personopplysningene dine.",
      "Avhengig av situasjonen kan du ha rett til å:",
    ],
    bullets: [
      "få innsyn i hvilke opplysninger Scopio har om deg",
      "be om retting av feilaktige opplysninger",
      "be om sletting av opplysninger",
      "be om begrensning av behandling",
      "protestere mot behandling",
      "be om dataportabilitet der dette gjelder",
      "trekke tilbake samtykke dersom behandlingen bygger på samtykke",
    ],
    afterBullets:
      "Du kan kontakte Scopio dersom du ønsker å bruke rettighetene dine.",
  },
  {
    title: "12. Informasjonskapsler og lignende teknologi",
    paragraphs: [
      "Scopio kan bruke informasjonskapsler og lignende teknologi for å få tjenesten til å fungere, holde deg innlogget, forbedre brukeropplevelsen og sikre tjenesten.",
      "Noen informasjonskapsler kan være nødvendige for at tjenesten skal fungere riktig.",
    ],
  },
  {
    title: "13. Endringer i personvernerklæringen",
    paragraphs: [
      "Scopio kan oppdatere denne personvernerklæringen ved behov.",
      "Den nyeste versjonen vil være tilgjengelig på denne siden.",
      "Ved større endringer kan Scopio forsøke å varsle deg på en tydelig måte, for eksempel via e-post, i tjenesten eller på nettsiden.",
    ],
  },
  {
    title: "14. Kontakt",
    paragraphs: [
      "Hvis du har spørsmål om personvern eller hvordan Scopio behandler personopplysninger, kan du kontakte oss.",
      "E-post: Dmytro@Maliarchuk.no",
      "Nettsted: scopio.no",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#081126]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6a3d] text-sm font-bold text-white">
              S
            </div>

            <div>
              <p className="text-base font-semibold leading-none text-[#081126]">
                Scopio
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Analytics for creators and teams
              </p>
            </div>
          </a>

          <a
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#081126] transition hover:bg-slate-50"
          >
            Tilbake til forsiden
          </a>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-gradient-to-br from-[#fff1ec] via-white to-[#f4f7fb]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex rounded-full border border-[#ff6a3d]/25 bg-[#ff6a3d]/10 px-4 py-2 text-sm font-semibold text-[#d94b24]">
              Juridisk dokument
            </div>

            <h1 className="text-5xl font-bold tracking-tight text-[#081126]">
              Personvernerklæring for{" "}
              <span className="text-[#ff6a3d]">Scopio</span>
            </h1>

            <p className="mt-6 text-lg leading-8 text-slate-600">
              Denne personvernerklæringen forklarer hvordan Scopio behandler
              personopplysninger når du oppretter konto, bruker tjenesten,
              legger inn sosiale medier-kontoer eller besøker nettsiden.
            </p>

            <p className="mt-5 text-sm text-slate-500">
              Sist oppdatert: 2. juni 2026
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-[#081126]">Innhold</p>

            <nav className="space-y-1">
              {sections.slice(0, 8).map((section) => (
                <a
                  key={section.title}
                  href={`#${section.title.split(".")[0]}`}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-[#fff1ec] hover:text-[#ff6a3d]"
                >
                  {section.title}
                </a>
              ))}

              <p className="px-3 pt-3 text-xs text-slate-400">
                + resten av erklæringen under
              </p>
            </nav>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-base leading-8 text-slate-700">
              Scopio behandler personopplysninger for å kunne levere en trygg,
              ryddig og fungerende analysetjeneste for sosiale medier.
            </p>

            <p className="mt-4 text-base leading-8 text-slate-700">
              Scopio skal ikke selge personopplysningene dine til andre.
            </p>
          </section>

          {sections.map((section) => (
            <section
              key={section.title}
              id={section.title.split(".")[0]}
              className="scroll-mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
            >
              <h2 className="text-2xl font-bold tracking-tight text-[#081126]">
                {section.title}
              </h2>

              <div className="mt-5 space-y-4 text-base leading-8 text-slate-700">
                {section.paragraphs.map((paragraph) => {
                  if (paragraph === "E-post: Dmytro@Maliarchuk.no") {
                    return (
                      <p key={paragraph}>
                        E-post:{" "}
                        <a
                          href="mailto:Dmytro@Maliarchuk.no"
                          className="font-semibold text-[#ff6a3d] underline-offset-4 hover:underline"
                        >
                          Dmytro@Maliarchuk.no
                        </a>
                      </p>
                    );
                  }

                  if (paragraph === "Nettsted: scopio.no") {
                    return (
                      <p key={paragraph}>
                        Nettsted:{" "}
                        <a
                          href="https://scopio.no"
                          className="font-semibold text-[#ff6a3d] underline-offset-4 hover:underline"
                        >
                          scopio.no
                        </a>
                      </p>
                    );
                  }

                  return <p key={paragraph}>{paragraph}</p>;
                })}

                {section.bullets && (
                  <ul className="space-y-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6a3d]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.afterBullets && <p>{section.afterBullets}</p>}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}