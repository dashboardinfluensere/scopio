"use client";

import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";

type InsightItem = {
  id: string;
  title: string;
  value: string;
  description: string;
  href?: string;
  actionLabel?: string;
};

function InsightCard({
  title,
  value,
  description,
  href,
  actionLabel,
  width,
}: {
  title: string;
  value: string;
  description: string;
  href?: string;
  actionLabel?: string;
  width: number;
}) {
  return (
    <div
      className="min-h-[210px] shrink-0 rounded-xl border px-4 py-4 md:px-5 md:py-5"
      style={{
        width: `${width}px`,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-soft)",
      }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
        {title}
      </p>

      <p
        className="mt-2 text-xl font-semibold tracking-tight md:mt-3 md:text-2xl"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </p>

      <p
        className="mt-2 text-sm leading-6"
        style={{ color: "var(--color-muted)" }}
      >
        {description}
      </p>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {actionLabel ?? "Åpne"}
        </a>
      ) : null}
    </div>
  );
}

function getCardsPerView(width: number) {
  if (width >= 1024) return 3;
  if (width >= 768) return 2;
  return 1;
}

export default function InsightsCarousel({ insights }: { insights: InsightItem[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const visibleInsights = useMemo(() => insights, [insights]);
  const gap = 16;
  const cardsPerView = getCardsPerView(viewportWidth);
  const maxIndex = Math.max(0, visibleInsights.length - cardsPerView);
  const cardWidth =
    viewportWidth > 0
      ? (viewportWidth - gap * (cardsPerView - 1)) / cardsPerView
      : 0;

  const translateX = activeIndex * (cardWidth + gap);

  function goToPrevious() {
    setActiveIndex((current) => Math.max(0, current - 1));
  }

  function goToNext() {
    setActiveIndex((current) => Math.min(maxIndex, current + 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    const touch = event.changedTouches[0];

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (startX == null || startY == null) {
      return;
    }

    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;

    if (Math.abs(diffY) > Math.abs(diffX)) {
      return;
    }

    if (diffX <= -45) {
      goToNext();
    }

    if (diffX >= 45) {
      goToPrevious();
    }
  }

  useEffect(() => {
    function updateWidth() {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      setViewportWidth(viewport.clientWidth);
    }

    updateWidth();

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(viewport);

    window.addEventListener("resize", updateWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, maxIndex));
  }, [maxIndex]);

  if (visibleInsights.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <div
        ref={viewportRef}
        className="min-w-0 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{
            gap: `${gap}px`,
            transform: `translateX(-${translateX}px)`,
          }}
        >
          {visibleInsights.map((insight) => (
            <InsightCard
              key={insight.id}
              title={insight.title}
              value={insight.value}
              description={insight.description}
              href={insight.href}
              actionLabel={insight.actionLabel}
              width={cardWidth}
            />
          ))}
        </div>
      </div>

      {visibleInsights.length > cardsPerView ? (
        <div className="mt-5 flex justify-center gap-3">
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Vis innsikt ${index + 1}`}
              className="h-3 rounded-full transition-all hover:opacity-80"
              style={{
                width: activeIndex === index ? "28px" : "12px",
                backgroundColor:
                  activeIndex === index
                    ? "var(--color-accent)"
                    : "var(--color-border)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
