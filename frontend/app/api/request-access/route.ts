import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerApiUrl } from "../../../lib/api";

const API_URL = getServerApiUrl();

export async function POST(request: Request) {
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
    const body = await request.json();

    const res = await fetch(`${API_URL}/access-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    return NextResponse.json(
      data ?? {
        ok: res.ok,
      },
      { status: res.status }
    );
  } catch (error) {
    console.error("[POST /api/request-access]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Kunne ikke sende forespørselen.",
      },
      { status: 500 }
    );
  }
}