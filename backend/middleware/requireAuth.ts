import type { NextFunction, Request as ExpressRequest, Response } from "express";
import { verifyToken } from "@clerk/backend";

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY mangler i backend .env");
}

const authorizedParties = Array.from(
  new Set(
    [
      process.env.CLERK_AUTHORIZED_PARTIES,
      process.env.FRONTEND_URL,
      process.env.APP_URL,
      process.env.CORS_ORIGIN,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]
      .flatMap((value) => String(value ?? "").split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  )
);

export type AuthenticatedRequest = ExpressRequest & {
  auth?: {
    userId: string;
    clerkUserId: string;
    sessionId: string | null;
  };
};

function getBearerToken(req: ExpressRequest): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  const [scheme, ...rest] = authHeader.split(" ");
  const token = rest.join(" ").trim();

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Mangler bearer-token",
      });
    }

    const payload = await verifyToken(token, {
      secretKey,
      authorizedParties:
        authorizedParties.length > 0 ? authorizedParties : undefined,
    });

    if (!payload?.sub || typeof payload.sub !== "string") {
      return res.status(401).json({
        ok: false,
        error: "Fant ikke gyldig bruker i token",
      });
    }

    req.auth = {
      userId: payload.sub,
      clerkUserId: payload.sub,
      sessionId: typeof payload.sid === "string" ? payload.sid : null,
    };

    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return res.status(401).json({
      ok: false,
      error: "Ugyldig eller manglende autentisering",
    });
  }
}