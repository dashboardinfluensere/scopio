import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerApiUrl } from "../../../../../../lib/api";

const API_URL = getServerApiUrl();

type RouteContext = {
  params: Promise<{
    accessRequestId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const authData = await auth();

    if (!authData.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ikke autentisert.",
        },
        { status: 401 }
      );
    }

    const token = await authData.getToken();
    const { accessRequestId } = await context.params;

    const res = await fetch(
      `${API_URL}/access-requests/${accessRequestId}/reject`,
      {
        method: "POST",
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => null);

    return NextResponse.json(
      data ?? {
        ok: res.ok,
      },
      { status: res.status }
    );
  } catch (error) {
    console.error("[POST /api/admin/access-requests/:accessRequestId/reject]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunne ikke avslå forespørselen.",
      },
      { status: 500 }
    );
  }
}