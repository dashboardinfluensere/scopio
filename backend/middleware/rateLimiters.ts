import rateLimit from "express-rate-limit";

const IS_PROD = process.env.NODE_ENV === "production";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === "/health" || req.path.startsWith("/webhooks");
  },
  message: {
    ok: false,
    error: "For mange forespørsler. Prøv igjen om litt.",
  },
});

export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 120 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange analysekall. Prøv igjen om litt.",
  },
});

export const expensiveJobLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange kostbare operasjoner. Prøv igjen om litt.",
  },
});

export const sensitiveActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forespørsler. Prøv igjen om litt.",
  },
});

export const joinWorkspaceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 10 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forsøk på å bli med i workspace. Prøv igjen om litt.",
  },
});

export const deleteWorkspaceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange sletteforsøk. Prøv igjen om litt.",
  },
});

export const socialAccountsWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 15 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forespørsler mot konto-handlinger. Prøv igjen om litt.",
  },
});

export const initialSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 5 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forsøk på initial submit. Prøv igjen om litt.",
  },
});

export const retryScrapeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 10 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forsøk på å restarte scraping. Prøv igjen om litt.",
  },
});

export const accessRequestCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 3 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange tilgangsforespørsler. Prøv igjen litt senere.",
  },
});

export const accessRequestAdminReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange admin-kall. Prøv igjen om litt.",
  },
});

export const accessRequestAdminActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: IS_PROD ? 20 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange admin-handlinger. Prøv igjen om litt.",
  },
});

export const meLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "For mange forespørsler mot brukerdata. Prøv igjen om litt.",
  },
});