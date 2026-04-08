"use client";

import { useMemo, useState } from "react";

type SocialAccount = {
  id: string;
  platform: string;
  accountHandle: string;
  displayName: string | null;
  profileUrl: string | null;
  isActive?: boolean;
};

type HeatmapCell = {
  weekdayIndex: number;
  timeSlotIndex: number;
  averageViews: number;
  postCount: number;
  hasEnoughData: boolean;
};

type PublishingHeatmapProps = {
  accounts: SocialAccount[];
  selectedAccountId: string;
  cells: HeatmapCell[];
  currentParams: Array<{ key: string; value: string }>;
};

const WEEKDAYS = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

const TIME_SLOTS = ["00:00–06:00", "06:00–12:00", "12:00–18:00", "18:00–24:00"];

function formatNumber(value: number) {
  return value.toLocaleString("no-NO");
}

function getPlatformLabel(platform: string) {
  const normalized = platform.toLowerCase();

  if (normalized === "tiktok") return "TikTok";
  if (normalized === "instagram") return "Instagram";

  return platform;
}

function getAccountLabel(account: SocialAccount) {
  const primary = account.displayName?.trim() || account.accountHandle;
  return `${primary} · ${getPlatformLabel(account.platform)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCellBackground(
  cell: HeatmapCell,
  minViews: number,
  maxViews: number
) {
  if (!cell.hasEnoughData) {
    return "var(--color-surface-soft)";
  }

  if (maxViews === minViews) {
    return "hsl(95 55% 42%)";
  }

  const normalized = clamp(
    (cell.averageViews - minViews) / (maxViews - minViews),
    0,
    1
  );

  const hue = 6 + normalized * 104;
  const saturation = 62;
  const lightness = 39 + normalized * 8;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getCellTextColor(
  cell: HeatmapCell,
  minViews: number,
  maxViews: number
) {
  if (!cell.hasEnoughData) {
    return "var(--color-muted)";
  }

  if (maxViews === minViews) {
    return "#FFFFFF";
  }

  const normalized = clamp(
    (cell.averageViews - minViews) / (maxViews - minViews),
    0,
    1
  );

  return normalized > 0.36 ? "#FFFFFF" : "#0F172A";
}

function getCellBorderColor(cell: HeatmapCell, isActive: boolean) {
  if (isActive) {
    return "var(--color-text)";
  }

  if (!cell.hasEnoughData) {
    return "var(--color-border)";
  }

  return "rgba(255,255,255,0.16)";
}

function DesktopHeatmapGrid({
  cells,
  minViews,
  maxViews,
}: {
  cells: HeatmapCell[];
  minViews: number;
  maxViews: number;
}) {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();

    cells.forEach((cell) => {
      map.set(`${cell.timeSlotIndex}-${cell.weekdayIndex}`, cell);
    });

    return map;
  }, [cells]);

  const activeCell =
    activeCellKey !== null ? cellMap.get(activeCellKey) ?? null : null;

  const activeCellTooltipPosition =
    activeCell && activeCell.weekdayIndex >= 5 ? "left" : "right";

  return (
    <div className="hidden sm:block">
      <div className="relative mt-6 overflow-x-auto overflow-y-visible">
        <div className="min-w-[840px] overflow-visible">
          <div className="grid grid-cols-[130px_repeat(7,minmax(92px,1fr))] gap-3 overflow-visible">
            <div />

            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="flex min-h-[46px] items-center justify-center rounded-lg px-3 py-3 text-center text-sm font-semibold"
                style={{
                  backgroundColor: "var(--color-surface-soft)",
                  color: "var(--color-text)",
                }}
              >
                {day}
              </div>
            ))}

            {TIME_SLOTS.map((slotLabel, timeSlotIndex) => (
              <div key={slotLabel} className="contents">
                <div
                  className="flex min-h-[112px] items-center justify-center rounded-lg px-3 py-3 text-center text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--color-surface-soft)",
                    color: "var(--color-text)",
                  }}
                >
                  {slotLabel}
                </div>

                {Array.from({ length: 7 }, (_, weekdayIndex) => {
                  const key = `${timeSlotIndex}-${weekdayIndex}`;
                  const cell = cellMap.get(key);

                  if (!cell) {
                    return (
                      <div
                        key={key}
                        className="h-[112px] rounded-xl border"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface-soft)",
                        }}
                      />
                    );
                  }

                  const isActive = activeCellKey === key;
                  const background = getCellBackground(cell, minViews, maxViews);
                  const textColor = getCellTextColor(cell, minViews, maxViews);
                  const borderColor = getCellBorderColor(cell, isActive);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCellKey(isActive ? null : key)}
                      className={[
                        "relative h-[112px] w-full overflow-visible rounded-xl border p-3 text-left transition hover:-translate-y-[1px]",
                        isActive ? "z-[500]" : "z-[2]",
                      ].join(" ")}
                      style={{
                        backgroundColor: background,
                        color: textColor,
                        borderColor,
                        boxShadow: isActive
                          ? "0 10px 28px rgba(0, 0, 0, 0.3)"
                          : "none",
                      }}
                    >
                      {cell.hasEnoughData ? (
                        <div className="flex h-full flex-col justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-80">
                            Snitt
                          </span>

                          <div>
                            <div className="text-lg font-bold leading-none">
                              {formatNumber(cell.averageViews)}
                            </div>

                            <div className="mt-1 text-xs opacity-80">
                              {cell.postCount} publiseringer
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex h-full items-center justify-center text-center text-xs font-semibold leading-4"
                          style={{ color: "var(--color-muted)" }}
                        >
                          Ikke nok data
                        </div>
                      )}

                      {isActive && activeCell ? (
                        <div
                          className="pointer-events-none absolute top-1/2 z-[300] w-[250px] -translate-y-1/2 rounded-xl border p-4 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
                          style={{
                            borderColor: "var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            color: "var(--color-text)",
                            left:
                              activeCellTooltipPosition === "right"
                                ? "calc(100% + 12px)"
                                : "auto",
                            right:
                              activeCellTooltipPosition === "left"
                                ? "calc(100% + 12px)"
                                : "auto",
                          }}
                        >
                          <p className="font-semibold">
                            {WEEKDAYS[activeCell.weekdayIndex]} ·{" "}
                            {TIME_SLOTS[activeCell.timeSlotIndex]}
                          </p>

                          {activeCell.hasEnoughData ? (
                            <>
                              <p
                                className="mt-2"
                                style={{ color: "var(--color-text-soft)" }}
                              >
                                Gjennomsnittlig{" "}
                                <span
                                  className="font-semibold"
                                  style={{ color: "var(--color-text)" }}
                                >
                                  {formatNumber(activeCell.averageViews)} views
                                </span>
                              </p>

                              <p
                                className="mt-1"
                                style={{ color: "var(--color-muted)" }}
                              >
                                Basert på {activeCell.postCount} publiseringer
                              </p>
                            </>
                          ) : (
                            <p
                              className="mt-2"
                              style={{ color: "var(--color-muted)" }}
                            >
                              Ikke nok data i denne perioden ennå.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileBestTimesList({
  cells,
}: {
  cells: HeatmapCell[];
}) {
  const rankedCells = useMemo(() => {
    return cells
      .filter((cell) => cell.hasEnoughData)
      .sort((a, b) => b.averageViews - a.averageViews)
      .slice(0, 5);
  }, [cells]);

  return (
    <div className="sm:hidden">
      <div
        className="mt-6 rounded-xl border p-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface-soft)",
        }}
      >
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Mobilvisning viser en forenklet oversikt
        </p>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: "var(--color-muted)" }}
        >
          Denne informasjonen er mye lettere å lese på desktop, hvor du ser hele
          heatmapet samtidig. På mobil viser vi derfor de beste tidspunktene i en
          enklere liste.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rankedCells.length === 0 ? (
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-soft)",
              color: "var(--color-muted)",
            }}
          >
            Ikke nok data ennå til å vise beste publiseringstidspunkt.
          </div>
        ) : (
          rankedCells.map((cell, index) => (
            <div
              key={`${cell.weekdayIndex}-${cell.timeSlotIndex}`}
              className="rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor:
                  index === 0
                    ? "var(--color-accent-soft)"
                    : "var(--color-surface-soft)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    #{index + 1} {WEEKDAYS[cell.weekdayIndex]} ·{" "}
                    {TIME_SLOTS[cell.timeSlotIndex]}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Basert på {cell.postCount} publiseringer
                  </p>
                </div>

                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor:
                      index === 0
                        ? "var(--color-accent)"
                        : "var(--color-surface)",
                    color: index === 0 ? "#ffffff" : "var(--color-text)",
                    border:
                      index === 0 ? "none" : "1px solid var(--color-border)",
                  }}
                >
                  {index === 0 ? "Best" : "Topp"}
                </span>
              </div>

              <div
                className="mt-4 text-[1.75rem] font-bold leading-none"
                style={{ color: "var(--color-text)" }}
              >
                {formatNumber(cell.averageViews)}
              </div>

              <p
                className="mt-2 text-sm"
                style={{ color: "var(--color-muted)" }}
              >
                Gjennomsnittlige views
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PublishingHeatmap({
  accounts,
  selectedAccountId,
  cells,
  currentParams,
}: PublishingHeatmapProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  const validCells = useMemo(
    () => cells.filter((cell) => cell.hasEnoughData),
    [cells]
  );

  const minViews = validCells.length
    ? Math.min(...validCells.map((cell) => cell.averageViews))
    : 0;

  const maxViews = validCells.length
    ? Math.max(...validCells.map((cell) => cell.averageViews))
    : 0;

  return (
    <section
      className="relative z-[1] w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-4 shadow-sm md:p-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-xl font-semibold leading-tight md:text-2xl"
              style={{ color: "var(--color-text)" }}
            >
              Beste publiseringstidspunkt
            </h3>

            <button
              type="button"
              onClick={() => setInfoOpen((prev) => !prev)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-muted)",
              }}
              aria-label="Vis info om heatmap"
            >
              i
            </button>
          </div>

          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Historisk snitt per ukedag og tidsrom for én profil om gangen.
          </p>

          {infoOpen ? (
            <div
              className="absolute left-0 top-[calc(100%+12px)] z-[200] w-[260px] max-w-[calc(100vw-48px)] rounded-xl border p-4 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:w-[340px]"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              Dette er et heatmap som gir en oversikt over når det historisk har
              vært best å publisere.
              <br />
              <br />
              1. Hver rute vurderer om det finnes nok data. Det krever minst 5
              publiseringer i det angitte tidsrommet.
              <br />
              2. Deretter sammenlignes resultatet i ruten med de andre rutene.
              <br />
              3. Den beste perioden får grønnest tone, mens svakere perioder går
              mer mot rødt.
              <br />
              4. Jo mer du bruker verktøyet, jo bedre blir indikasjonen fordi mer
              data gir tryggere mønstre.
            </div>
          ) : null}
        </div>

        <form method="GET" className="flex w-full min-w-0 items-center gap-3 lg:w-auto">
          {currentParams
            .filter((param) => param.key !== "heatmapAccountId")
            .map((param, index) => (
              <input
                key={`${param.key}-${param.value}-${index}`}
                type="hidden"
                name={param.key}
                value={param.value}
              />
            ))}

          <label className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--color-muted)" }}
            >
              Profil
            </span>

            <select
              name="heatmapAccountId"
              defaultValue={selectedAccountId}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="w-full min-w-0 rounded-xl border px-4 py-3 text-sm font-medium outline-none transition sm:w-auto"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {getAccountLabel(account)}
                </option>
              ))}
            </select>
          </label>
        </form>
      </div>

      <MobileBestTimesList cells={cells} />
      <DesktopHeatmapGrid cells={cells} minViews={minViews} maxViews={maxViews} />

      <div
        className="mt-5 flex flex-wrap items-center gap-3 text-xs"
        style={{ color: "var(--color-muted)" }}
      >
        <div className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#B91C1C]" />
          Lavest snitt
        </div>

        <div className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#65A30D]" />
          Høyest snitt
        </div>

        <div className="inline-flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: "var(--color-border)" }}
          />
          Ikke nok data
        </div>
      </div>
    </section>
  );
}