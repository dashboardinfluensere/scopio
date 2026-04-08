import { auth } from "@clerk/nextjs/server";
import { getServerApiUrl } from "../../../../lib/api";

const API_URL = getServerApiUrl();

export async function GET(request: Request) {
  try {
    const { userId, getToken } = await auth();

    if (!userId) {
      return Response.json(
        {
          ok: false,
          error: "Ikke autentisert",
        },
        { status: 401 }
      );
    }

    const token = await getToken();

    if (!token) {
      return Response.json(
        {
          ok: false,
          error: "Fant ikke gyldig token",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");

    const backendUrl = new URL(`${API_URL}/admin-logs`);
    if (limit) {
      backendUrl.searchParams.set("limit", limit);
    }

    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    return Response.json(
      data ?? {
        ok: false,
        error: "Ugyldig svar fra backend",
      },
      { status: res.status }
    );
  } catch (error) {
    console.error("[GET /api/admin/logs] error:", error);

    return Response.json(
      {
        ok: false,
        error: "Kunne ikke hente admin-logger",
      },
      { status: 500 }
    );
  }
}