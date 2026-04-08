import { ApifyClient } from "apify-client";

const token = process.env.APIFY_TOKEN;

if (!token) {
  throw new Error("APIFY_TOKEN mangler i .env");
}

const client = new ApifyClient({
  token,
});

const TIKTOK_ACTOR_ID = "clockworks/tiktok-scraper";
const INSTAGRAM_ACTOR_ID = "apify/instagram-scraper";

/* =========================
   TIKTOK TYPES
========================= */

export type ApifyTikTokPost = {
  id?: string;
  webVideoUrl?: string;
  text?: string;
  createTimeISO?: string;
  createTime?: number;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
  covers?: {
    default?: string;
    origin?: string;
    dynamic?: string;
  };
  videoMeta?: {
    duration?: number;
    coverUrl?: string;
  };
  authorMeta?: {
    name?: string;
  };
};

/* =========================
   INSTAGRAM TYPES
========================= */

export type ApifyInstagramPost = {
  id?: string;
  shortcode?: string;
  shortCode?: string;
  url?: string;
  caption?: string;
  timestamp?: string;
  takenAtTimestamp?: number;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  videoDuration?: number;
  displayUrl?: string;
  displayUrlVideo?: string;
  videoUrl?: string;
  type?: string;
  productType?: string;
  ownerUsername?: string;
  owner?: {
    username?: string;
  };
  error?: string;
  errorDescription?: string;
};

export async function runApifyTaskForProfile(
  profileHandle: string,
  resultsPerPage: number
) {
  const cleanedHandle = profileHandle.trim().replace(/^@/, "");

  const input = {
    profiles: [cleanedHandle],
    resultsPerPage,
    profileScrapeSections: ["videos"],
    profileSorting: "latest",

    commentsPerPost: 0,
    excludePinnedPosts: false,
    maxFollowersPerProfile: 0,
    maxFollowingPerProfile: 0,
    maxRepliesPerComment: 0,
    proxyCountryCode: "None",
    scrapeRelatedVideos: false,
    shouldDownloadAvatars: false,
    shouldDownloadCovers: true,
    shouldDownloadMusicCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadVideos: false,

    hashtags: [],
    searchQueries: [],
    videoURLs: [],
  };

  const run = await client.actor(TIKTOK_ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return (items as ApifyTikTokPost[]).filter((post) => {
    const author = post.authorMeta?.name?.toLowerCase().trim();
    return !author || author === cleanedHandle.toLowerCase();
  });
}

export async function runApifyInstagramTaskForProfile(
  profileHandle: string,
  resultsLimit: number
) {
  const cleanedHandle = profileHandle.trim().replace(/^@/, "");

  const input = {
    addParentData: false,
    directUrls: [`https://www.instagram.com/${cleanedHandle}/`],
    resultsLimit,
    resultsType: "posts",
    searchLimit: 1,
  };

  console.log(
    "INSTAGRAM APIFY INPUT:",
    JSON.stringify(input, null, 2)
  );

  const run = await client.actor(INSTAGRAM_ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  console.log("INSTAGRAM RAW COUNT:", items.length);

  if (items.length > 0) {
    console.log(
      "INSTAGRAM RAW FIRST ITEM:",
      JSON.stringify(items[0], null, 2)
    );
  }

  return (items as ApifyInstagramPost[]).filter((post) => {
    if (post.error) {
      return false;
    }

    const owner =
      post.ownerUsername?.toLowerCase().trim() ||
      post.owner?.username?.toLowerCase().trim();

    return !owner || owner === cleanedHandle.toLowerCase();
  });
}