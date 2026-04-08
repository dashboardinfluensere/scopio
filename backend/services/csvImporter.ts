import { prisma } from "../prisma";
import { ImportSourceType, ImportStatus, Platform } from "@prisma/client";
import { parse } from "csv-parse/sync";

type CsvRow = {
  id: string;
  link?: string;
  publishTime?: string;
  views?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  description?: string;
  tags?: string;
  timestamp?: string;
  dataTime?: string;
  account?: string;
  duration?: string;
};

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();

  const trimmed = value.trim();

  // Forsøk vanlig Date først
  const native = new Date(trimmed);
  if (!Number.isNaN(native.getTime())) {
    return native;
  }

  // Format: 06/01/2025 12.49.18
  const [datePart, timePart] = trimmed.split(" ");
  if (!datePart) return new Date();

  const [day, month, year] = datePart.split("/");
  const normalizedTime = (timePart ?? "00.00.00").replace(/\./g, ":");

  const isoLike = `${year}-${month}-${day}T${normalizedTime}`;
  const parsed = new Date(isoLike);

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function getOrCreateDevOrganization() {
  const existing = await prisma.organization.findFirst({
    where: {
      name: "Dev Organization",
    },
  });

  if (existing) return existing;

  return prisma.organization.create({
    data: {
      name: "Dev Organization",
    },
  });
}

export async function importTikTokCsv(buffer: Buffer) {
  const csvText = buffer.toString("utf-8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const organization = await getOrCreateDevOrganization();

  const importRun = await prisma.importRun.create({
    data: {
      organizationId: organization.id,
      sourceType: ImportSourceType.MANUAL_UPLOAD,
      fileName: "tiktok-import.csv",
      fileFormat: "csv",
      status: ImportStatus.PROCESSING,
      platformGuess: Platform.TIKTOK,
      rowCount: rows.length,
    },
  });

  try {
    for (const row of rows) {
      const cleanedHandle = (row.account ?? "").trim().replace(/^@/, "") || "unknown";
      const publishedAt = parseDate(row.publishTime);
      const scrapedAt = new Date();

      const socialAccount = await prisma.socialAccount.upsert({
        where: {
          organizationId_platform_accountHandle: {
            organizationId: organization.id,
            platform: Platform.TIKTOK,
            accountHandle: cleanedHandle,
          },
        },
        update: {
          displayName: cleanedHandle,
          profileUrl: `https://www.tiktok.com/@${cleanedHandle}`,
        },
        create: {
          organizationId: organization.id,
          platform: Platform.TIKTOK,
          accountHandle: cleanedHandle,
          displayName: cleanedHandle,
          profileUrl: `https://www.tiktok.com/@${cleanedHandle}`,
        },
      });

      const post = await prisma.contentPost.upsert({
        where: {
          socialAccountId_externalPostId: {
            socialAccountId: socialAccount.id,
            externalPostId: row.id,
          },
        },
        update: {
          url: row.link || null,
          caption: row.description || null,
          tags: row.tags
            ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
            : [],
          publishedAt,
          durationSeconds: toInt(row.duration),
        },
        create: {
          organizationId: organization.id,
          socialAccountId: socialAccount.id,
          platform: Platform.TIKTOK,
          externalPostId: row.id,
          url: row.link || null,
          caption: row.description || null,
          tags: row.tags
            ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
            : [],
          publishedAt,
          durationSeconds: toInt(row.duration),
        },
      });

      await prisma.postSnapshot.upsert({
        where: {
          contentPostId_scrapedAt: {
            contentPostId: post.id,
            scrapedAt,
          },
        },
        update: {
          views: toInt(row.views),
          likes: toInt(row.likes),
          comments: toInt(row.comments),
          shares: toInt(row.shares),
          importRunId: importRun.id,
        },
        create: {
          organizationId: organization.id,
          contentPostId: post.id,
          scrapedAt,
          views: toInt(row.views),
          likes: toInt(row.likes),
          comments: toInt(row.comments),
          shares: toInt(row.shares),
          importRunId: importRun.id,
        },
      });
    }

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: ImportStatus.COMPLETED,
      },
    });

    return {
      ok: true,
      importedRows: rows.length,
      importRunId: importRun.id,
      organizationId: organization.id,
    };
  } catch (error) {
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: ImportStatus.FAILED,
        notes: error instanceof Error ? error.message : "Ukjent feil",
      },
    });

    throw error;
  }
}