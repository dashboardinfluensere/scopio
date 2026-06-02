const sections = [
  {
    title: "1. Om Scopio",
    paragraphs: [
      "Scopio er en digital analyseplattform for sosiale medier.",
      "Tjenesten kan blant annet gi oversikt over utvikling, publiseringsmønstre, innholdsprestasjoner, historiske tall og annen statistikk knyttet til sosiale medier-kontoer.",
      "Scopio drives av Dmytro Maliarchuk.",
      "E-post: Dmytro@Maliarchuk.no",
      "Nettsted: scopio.no",
    ],
  },
  {
    title: "2. Hvem kan bruke tjenesten",
    paragraphs: [
      "For å bruke Scopio må du være minst 18 år.",
      "Dersom du er under 18 år, må du ha samtykke fra foresatte.",
      "Du må oppgi korrekt informasjon når du oppretter konto eller bruker tjenesten.",
      "Du er selv ansvarlig for å holde innloggingsinformasjon, konto og passord sikkert.",
      "Du er også ansvarlig for all aktivitet som skjer gjennom kontoen din.",
    ],
  },
  {
    title: "3. Konto og arbeidsområde",
    paragraphs: [
      "Når du oppretter konto i Scopio, kan du opprette eller bli medlem av et arbeidsområde.",
      "Et arbeidsområde kan for eksempel være knyttet til én person, et team, en bedrift eller en kunde.",
      "Eieren av arbeidsområdet har ansvar for:",
    ],
    bullets: [
      "hvem som får tilgang til arbeidsområdet",
      "hvilke brukere som inviteres",
      "hvilke sosiale medier-kontoer som legges inn",
      "betaling og abonnement",
      "at bruken av Scopio skjer i tråd med disse vilkårene",
    ],
    afterBullets:
      "Scopio kan begrense eller fjerne tilgang dersom tjenesten misbrukes, betaling uteblir, eller vilkårene brytes.",
  },
  {
    title: "4. Abonnement og priser",
    paragraphs: [
      "Scopio tilbys gjennom ulike abonnementer.",
      "Hvilke funksjoner, grenser og priser som gjelder, vises på nettsiden eller i tjenesten når du registrerer deg eller kjøper abonnement.",
      "Ulike abonnementer kan ha ulike grenser for for eksempel:",
    ],
    bullets: [
      "antall sosiale medier-kontoer",
      "antall brukere i arbeidsområdet",
      "historiske data",
      "tilgang til funksjoner",
      "oppdateringsfrekvens",
      "supportnivå",
    ],
    afterBullets:
      "Ved kjøp av abonnement godtar du prisen og vilkårene som gjelder for abonnementet du velger. Prisene kan være oppgitt både ekskl. og inkl. MVA der dette er relevant.",
  },
  {
    title: "5. Prøveperiode",
    paragraphs: [
      "Scopio kan tilby en gratis prøveperiode.",
      "Prøveperioden gir deg tilgang til tjenesten i en begrenset periode, med de funksjonene og begrensningene som gjelder for prøveperioden.",
      "Når prøveperioden utløper, kan tilgangen bli begrenset dersom du ikke oppgraderer til et betalt abonnement.",
      "Scopio kan slette, deaktivere eller begrense data, analyser og tilkoblede kontoer etter utløpt prøveperiode dersom det er nødvendig for drift, kostnadskontroll eller sikkerhet.",
    ],
  },
  {
    title: "6. Betaling",
    paragraphs: [
      "Betaling skjer gjennom de betalingsløsningene Scopio til enhver tid tilbyr.",
      "Du er ansvarlig for å betale gjeldende pris for abonnementet du velger.",
      "Dersom betaling mislykkes eller uteblir, kan Scopio begrense, suspendere eller stenge tilgangen til tjenesten.",
      "Scopio kan endre priser, men prisendringer vil ikke gjelde med tilbakevirkende kraft.",
      "Dersom det gjøres vesentlige prisendringer, vil Scopio forsøke å varsle deg på en tydelig måte før endringen trer i kraft.",
    ],
  },
  {
    title: "7. Oppsigelse",
    paragraphs: [
      "Du kan si opp abonnementet ditt når som helst.",
      "Ved oppsigelse vil du normalt ha tilgang til tjenesten ut inneværende betalte periode, med mindre annet er avtalt eller tydelig oppgitt.",
      "Scopio refunderer normalt ikke allerede betalte beløp, med mindre dette følger av lov eller særskilt avtale.",
      "Etter oppsigelse kan Scopio slette eller anonymisere data knyttet til kontoen eller arbeidsområdet ditt i tråd med personvernerklæringen og gjeldende regler.",
    ],
  },
  {
    title: "8. Angrerett for privatkunder",
    paragraphs: [
      "Dersom du kjøper Scopio som privatperson, kan du ha rett til å angre kjøpet innen 14 dager.",
      "Siden Scopio er en digital tjeneste som kan tas i bruk med én gang, kan angreretten helt eller delvis bortfalle dersom du starter å bruke tjenesten før angrefristen er over.",
      "Ved å opprette konto, starte prøveperiode eller kjøpe abonnement, godtar du at Scopio kan levere tjenesten med en gang.",
      "Dersom du kjøper Scopio som bedrift, gjelder det normalt ikke angrerett, med mindre dette er avtalt skriftlig.",
    ],
  },
  {
    title: "9. Tillatt bruk",
    paragraphs: [
      "Du kan kun bruke Scopio til å legge inn og analysere sosiale medier-kontoer som du selv eier, administrerer eller har tydelig tillatelse til å bruke.",
      "Det er ikke tillatt å legge inn kontoer du ikke har rett til å analysere.",
      "Du kan ikke bruke Scopio til å:",
    ],
    bullets: [
      "bryte loven",
      "overvåke, analysere eller følge kontoer du ikke har lovlig tilgang til",
      "forsøke å få tilgang til andres kontoer, data eller arbeidsområder",
      "omgå tekniske begrensninger i tjenesten",
      "kopiere, videreselge eller misbruke Scopio uten skriftlig avtale",
      "laste opp skadelig kode eller forsøke å skade tjenesten",
      "bruke Scopio på en måte som bryter vilkårene til sosiale medier-plattformer",
    ],
    afterBullets:
      "Ved brudd på dette kan Scopio begrense, suspendere eller avslutte kontoen din.",
  },
  {
    title: "10. Eksterne tjenester og plattformer",
    paragraphs: [
      "Scopio er avhengig av enkelte eksterne tjenester og plattformer for å kunne levere funksjonaliteten i tjenesten.",
      "Scopio kontrollerer ikke disse eksterne tjenestene.",
      "Dersom en ekstern tjeneste endrer seg, har tekniske problemer, begrenser tilgang eller slutter å fungere, kan det påvirke deler av Scopio.",
      "Dette kan føre til at enkelte funksjoner blir midlertidig utilgjengelige, endres eller fjernes.",
      "Scopio er ikke ansvarlig for feil, endringer, begrensninger eller nedetid som skyldes eksterne tjenester eller plattformer.",
    ],
  },
  {
    title: "11. Data og nøyaktighet",
    paragraphs: [
      "Scopio forsøker å gi så korrekt statistikk som mulig.",
      "Likevel kan Scopio ikke garantere at alle tall alltid er fullstendige, oppdaterte eller feilfrie.",
      "Tall fra sosiale medier kan endres over tid, variere mellom kilder eller bli påvirket av tekniske begrensninger.",
      "Du bør derfor ikke bruke Scopio som eneste grunnlag for viktige økonomiske, juridiske eller strategiske beslutninger.",
      "Du er selv ansvarlig for hvordan du bruker informasjonen, statistikken og analysene du får gjennom Scopio.",
    ],
  },
  {
    title: "12. Kundens ansvar for kontoer og innhold",
    paragraphs: [
      "Du er selv ansvarlig for at du har rett til å legge inn, koble til eller analysere kontoene du bruker i Scopio.",
      "Du skal kun legge inn kontoer som du selv eier, administrerer eller har fått tydelig tillatelse til å analysere.",
      "Dersom du legger inn kontoer, innhold eller informasjon du ikke har rett til å bruke, er dette ditt ansvar.",
      "Du er også ansvarlig for hvordan du bruker innsikten, rapportene og analysene du får gjennom Scopio.",
    ],
  },
  {
    title: "13. Immaterielle rettigheter",
    paragraphs: [
      "Scopio, inkludert navn, logo, design, kode, funksjoner, struktur, analysemodeller, tekst, databaser og annet innhold, eies av Scopio eller våre lisensgivere.",
      "Du får en begrenset, ikke-eksklusiv og ikke-overførbar rett til å bruke tjenesten så lenge du har gyldig tilgang.",
      "Du får ikke rett til å:",
    ],
    bullets: [
      "kopiere Scopio",
      "selge eller videreselge tjenesten",
      "endre eller distribuere tjenesten",
      "forsøke å hente ut eller kopiere kode, struktur eller databaser",
      "bygge en konkurrerende tjeneste basert på Scopio uten skriftlig samtykke",
    ],
  },
  {
    title: "14. Personvern",
    paragraphs: [
      "Scopio behandler enkelte personopplysninger for å kunne levere tjenesten.",
      "Dette kan for eksempel være navn, e-postadresse, innloggingsinformasjon, hvilken organisasjon du tilhører, hvilke kontoer du legger til, teknisk informasjon og bruk av tjenesten.",
      "Scopio bruker disse opplysningene for å:",
    ],
    bullets: [
      "opprette og administrere brukerkontoen din",
      "gi deg tilgang til riktig arbeidsområde",
      "levere analyser og funksjoner",
      "håndtere betaling og abonnement",
      "forbedre og sikre tjenesten",
      "gi kundestøtte",
    ],
    afterBullets:
      "Scopio skal ikke selge personopplysningene dine til andre. Mer informasjon om hvordan personopplysninger behandles, skal stå i Scopios personvernerklæring.",
  },
  {
    title: "15. Kundedata",
    paragraphs: [
      "Du eier fortsatt dataene og kontoene du legger inn i Scopio.",
      "Scopio får kun rett til å bruke dataene som er nødvendige for å levere tjenesten til deg.",
      "Det betyr at Scopio kan behandle, lagre og vise data knyttet til kontoen din og arbeidsområdet ditt, så lenge det er nødvendig for at tjenesten skal fungere.",
      "Når du bruker Scopio, er du ansvarlig for at du har rett til å legge inn og analysere de kontoene du kobler til tjenesten.",
      "Dersom du sletter kontoen din eller avslutter abonnementet, kan Scopio slette eller anonymisere data i tråd med personvernerklæringen og gjeldende regler.",
    ],
  },
  {
    title: "16. Sikkerhet",
    paragraphs: [
      "Scopio skal gjøre rimelige tekniske og organisatoriske tiltak for å beskytte tjenesten og dataene som behandles.",
      "Dette kan blant annet inkludere tilgangskontroll, innlogging, sikker lagring, logging, begrensning av tilganger og overvåking av mistenkelig aktivitet.",
      "Ingen digital tjeneste er likevel helt risikofri.",
      "Du er selv ansvarlig for å:",
    ],
    bullets: [
      "bruke et sikkert passord",
      "beskytte egne enheter",
      "ikke dele innloggingsinformasjon med uvedkommende",
      "kontrollere hvem som har tilgang til arbeidsområdet ditt",
      "gi beskjed dersom du oppdager uautorisert bruk",
    ],
  },
  {
    title: "17. Tilgjengelighet og drift",
    paragraphs: [
      "Scopio forsøker å holde tjenesten tilgjengelig og stabil.",
      "Likevel kan Scopio ikke garantere at tjenesten alltid vil være tilgjengelig uten feil eller avbrudd.",
      "Tjenesten kan være utilgjengelig ved for eksempel:",
    ],
    bullets: [
      "vedlikehold",
      "tekniske feil",
      "sikkerhetshendelser",
      "kapasitetsproblemer",
      "problemer hos eksterne tjenester",
      "endringer i eksterne plattformer",
    ],
    afterBullets:
      "Scopio kan gjøre endringer i tjenesten for å forbedre funksjonalitet, sikkerhet, ytelse, brukeropplevelse eller forretningsmodell.",
  },
  {
    title: "18. Ansvar",
    paragraphs: [
      "Scopio skal gjøre sitt beste for å levere en stabil og nyttig tjeneste, men vi kan ikke garantere at tjenesten alltid er feilfri, komplett eller tilgjengelig.",
      "Scopio er ikke ansvarlig for tap som skyldes:",
    ],
    bullets: [
      "feil eller mangler i tall og analyser",
      "nedetid eller tekniske problemer",
      "endringer hos eksterne tjenester",
      "at kunden bruker informasjonen fra Scopio på feil måte",
      "tapte inntekter, tapte kunder eller andre indirekte tap",
    ],
    afterBullets:
      "Dersom Scopio likevel blir ansvarlig for et økonomisk tap, er ansvaret begrenset til det kunden har betalt for Scopio de siste 3 månedene. Denne begrensningen gjelder ikke dersom noe annet følger av loven.",
  },
  {
    title: "19. Suspensjon og avslutning",
    paragraphs: [
      "Scopio kan begrense, suspendere eller avslutte tilgangen din dersom:",
    ],
    bullets: [
      "du bryter disse vilkårene",
      "du misbruker tjenesten",
      "betaling uteblir",
      "bruken skaper sikkerhetsrisiko",
      "du bryter loven",
      "du bryter vilkår hos relevante eksterne plattformer",
      "Scopio må gjøre det av juridiske, tekniske eller driftsmessige grunner",
    ],
    afterBullets:
      "Ved alvorlig misbruk kan kontoen avsluttes uten forhåndsvarsel. Dersom tilgangen avsluttes, kan Scopio slette eller anonymisere data knyttet til kontoen eller arbeidsområdet ditt i tråd med personvernerklæringen og gjeldende regler.",
  },
  {
    title: "20. Endringer i vilkårene",
    paragraphs: [
      "Scopio kan oppdatere disse vilkårene ved behov.",
      "Dersom endringene er viktige for deg som kunde, vil vi forsøke å varsle deg på en tydelig måte, for eksempel via e-post, i tjenesten eller på nettsiden.",
      "Dersom du fortsetter å bruke Scopio etter at de nye vilkårene har trådt i kraft, betyr det at du godtar de oppdaterte vilkårene.",
      "Hvis du ikke godtar de nye vilkårene, kan du slutte å bruke tjenesten og si opp abonnementet ditt.",
    ],
  },
  {
    title: "21. Lovvalg og tvister",
    paragraphs: [
      "Disse vilkårene reguleres av norsk rett.",
      "Eventuelle uenigheter skal først forsøkes løst gjennom dialog mellom deg og Scopio.",
      "Dersom partene ikke blir enige, kan saken bringes inn for norske domstoler.",
      "For forbrukere gjelder de rettighetene og klagemulighetene som følger av norsk lov.",
    ],
  },
  {
    title: "22. Kontakt",
    paragraphs: [
      "Spørsmål om disse vilkårene kan sendes til:",
      "E-post: Dmytro@Maliarchuk.no",
      "Nettsted: scopio.no",
    ],
  },
];

export default function TermsOfServicePage() {
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
              Brukervilkår for{" "}
              <span className="text-[#ff6a3d]">Scopio</span>
            </h1>

            <p className="mt-6 text-lg leading-8 text-slate-600">
              Disse brukervilkårene gjelder for bruk av Scopio. Ved å opprette
              konto, starte prøveperiode, kjøpe abonnement eller bruke Scopio,
              godtar du disse vilkårene.
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
                + resten av vilkårene under
              </p>
            </nav>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-base leading-8 text-slate-700">
              Scopio er en digital tjeneste som gir brukere oversikt,
              statistikk og analyser knyttet til egne sosiale medier-kontoer.
            </p>

            <p className="mt-4 text-base leading-8 text-slate-700">
              Dette dokumentet forklarer hvilke regler som gjelder når du bruker
              Scopio.
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