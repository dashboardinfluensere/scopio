"use client";

import { FormEvent, useMemo, useState } from "react";

type PublishedContentPost = {
  id: string;
  url: string;
  thumbnailUrl: string;
  caption: string;
  publishedAt: string;
  platform: string | null;
  engagementRate: number;
  latestSnapshot: {
    views: number;
    likes: number;
    comments: number;
  };
};

type SortBy = "publishedAt" | "views" | "likes" | "comments" | "engagementRate";
type SortOrder = "asc" | "desc";
type TableView = "all" | "min";

function formatNumber(value: number) {
  return value.toLocaleString("no-NO");
}

function formatPercent(value: number) {
  return `${value.toLocaleString("no-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getPlatformLabel(platform: string | null) {
  if (!platform) return "Ukjent";

  const normalized = platform.toLowerCase();

  if (normalized === "tiktok") return "TikTok";
  if (normalized === "instagram") return "Instagram";

  return platform;
}

function normalizeSortBy(value: string): SortBy {
  if (
    value === "publishedAt" ||
    value === "views" ||
    value === "likes" ||
    value === "comments" ||
    value === "engagementRate"
  ) {
    return value;
  }

  return "publishedAt";
}

function normalizeSortOrder(value: string): SortOrder {
  return value === "asc" ? "asc" : "desc";
}

function normalizeTableView(value: string): TableView {
  return value === "all" ? "all" : "min";
}

function getSortValue(post: PublishedContentPost, sortBy: SortBy) {
  if (sortBy === "publishedAt") {
    const time = new Date(post.publishedAt).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (sortBy === "views") return post.latestSnapshot.views;
  if (sortBy === "likes") return post.latestSnapshot.likes;
  if (sortBy === "comments") return post.latestSnapshot.comments;

  return post.engagementRate;
}

export default function PublishedContentTable({
  posts,
  initialSearch,
  initialSortBy,
  initialSortOrder,
  initialView,
}: {
  posts: PublishedContentPost[];
  initialSearch: string;
  initialSortBy: string;
  initialSortOrder: string;
  initialView: string;
}) {
  const [searchDraft, setSearchDraft] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch.trim());
  const [sortBy, setSortBy] = useState<SortBy>(normalizeSortBy(initialSortBy));
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    normalizeSortOrder(initialSortOrder)
  );
  const [tableView, setTableView] = useState<TableView>(
    normalizeTableView(initialView)
  );

  const filteredAndSortedPosts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredPosts = normalizedSearch
      ? posts.filter((post) =>
          [post.caption, post.platform, getPlatformLabel(post.platform)]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : posts;

    return [...filteredPosts].sort((a, b) => {
      const aValue = getSortValue(a, sortBy);
      const bValue = getSortValue(b, sortBy);
      const diff = aValue - bValue;

      return sortOrder === "asc" ? diff : -diff;
    });
  }, [posts, searchQuery, sortBy, sortOrder]);

  const visiblePosts =
    tableView === "all"
      ? filteredAndSortedPosts
      : filteredAndSortedPosts.slice(0, 10);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchDraft.trim());
    setTableView("min");
  }

  function handleSort(nextSortBy: SortBy) {
    if (sortBy === nextSortBy) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
      return;
    }

    setSortBy(nextSortBy);
    setSortOrder("desc");
  }

  function getSortArrow(column: SortBy) {
    if (sortBy !== column) {
      return "↕";
    }

    return sortOrder === "asc" ? "↑" : "↓";
  }

  const toggleViewLabel = tableView === "all" ? "Vis færre" : "Vis alle";

  return (
    <section
      className="rounded-xl border p-4 shadow-sm md:p-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3
            className="text-xl font-semibold md:text-2xl"
            style={{ color: "var(--color-text)" }}
          >
            Publisert innhold
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Søk i caption og sorter innholdet slik du vil.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setTableView(tableView === "all" ? "min" : "all")}
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {toggleViewLabel}
        </button>
      </div>

      <form onSubmit={handleSearch} className="mt-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Søk i caption..."
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          />

          <button
            type="submit"
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Søk
          </button>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto">
        <div className={tableView === "all" ? "max-h-[620px] overflow-y-auto" : ""}>
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead
              className="sticky top-0 z-10"
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <tr>
                <th
                  className="border-b px-4 py-3 text-left font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  Lenke
                </th>

                <th
                  className="border-b px-4 py-3 text-left font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("publishedAt")}
                    className="inline-flex items-center gap-2 bg-transparent p-0 text-left font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Dato
                    <span className="text-xs">{getSortArrow("publishedAt")}</span>
                  </button>
                </th>

                <th
                  className="border-b px-4 py-3 text-right font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("views")}
                    className="inline-flex items-center gap-2 bg-transparent p-0 text-left font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Views
                    <span className="text-xs">{getSortArrow("views")}</span>
                  </button>
                </th>

                <th
                  className="border-b px-4 py-3 text-right font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("likes")}
                    className="inline-flex items-center gap-2 bg-transparent p-0 text-left font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Likes
                    <span className="text-xs">{getSortArrow("likes")}</span>
                  </button>
                </th>

                <th
                  className="border-b px-4 py-3 text-right font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("comments")}
                    className="inline-flex items-center gap-2 bg-transparent p-0 text-left font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Kommentarer
                    <span className="text-xs">{getSortArrow("comments")}</span>
                  </button>
                </th>

                <th
                  className="border-b px-4 py-3 text-right font-medium"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("engagementRate")}
                    className="inline-flex items-center gap-2 bg-transparent p-0 text-left font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Engasjement i %
                    <span className="text-xs">{getSortArrow("engagementRate")}</span>
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {visiblePosts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Ingen innlegg funnet.
                  </td>
                </tr>
              ) : (
                visiblePosts.map((post) => (
                  <tr key={post.id} style={{ backgroundColor: "transparent" }}>
                    <td
                      className="border-b px-4 py-4 text-left"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <div className="flex items-center gap-3">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0"
                        >
                          {post.thumbnailUrl ? (
                            <img
                              src={post.thumbnailUrl}
                              alt=""
                              className="h-14 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-14 w-10 items-center justify-center rounded-md border text-[10px] font-semibold"
                              style={{
                                borderColor: "var(--color-border)",
                                backgroundColor: "var(--color-surface-muted)",
                                color: "var(--color-muted)",
                              }}
                            >
                              —
                            </div>
                          )}
                        </a>

                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer"
                          title={post.caption || "Åpne innlegg"}
                          className="font-medium underline underline-offset-4"
                          style={{ color: "var(--color-text)" }}
                        >
                          {getPlatformLabel(post.platform)}
                        </a>
                      </div>
                    </td>

                    <td
                      className="border-b px-4 py-4 text-left"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      {formatDate(post.publishedAt)}
                    </td>

                    <td
                      className="border-b px-4 py-4 text-right tabular-nums"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      {formatNumber(post.latestSnapshot.views)}
                    </td>

                    <td
                      className="border-b px-4 py-4 text-right tabular-nums"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      {formatNumber(post.latestSnapshot.likes)}
                    </td>

                    <td
                      className="border-b px-4 py-4 text-right tabular-nums"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      {formatNumber(post.latestSnapshot.comments)}
                    </td>

                    <td
                      className="border-b px-4 py-4 text-right tabular-nums font-semibold"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      {formatPercent(post.engagementRate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
        style={{ color: "var(--color-muted)" }}
      >
        <p>
          Viser {visiblePosts.length} av {filteredAndSortedPosts.length} innlegg
        </p>

        {filteredAndSortedPosts.length > 10 ? (
          <button
            type="button"
            onClick={() => setTableView(tableView === "all" ? "min" : "all")}
            className="text-left font-medium underline underline-offset-4"
            style={{ color: "var(--color-text)" }}
          >
            {toggleViewLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
