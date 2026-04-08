import {
  auth,
  reverificationErrorResponse,
} from "@clerk/nextjs/server";

const API_URL = process.env.API_URL;

if (!API_URL) {
  throw new Error("API_URL mangler i frontend sitt server-miljø");
}

type RouteContext = {
  params: Promise<{
    organizationId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { userId, getToken, has } = await auth();

    if (!userId) {
      return Response.json(
        {
          ok: false,
          error: "Ikke autentisert",
        },
        { status: 401 }
      );
    }

    const hasFreshReverification = has({ reverification: "strict" });

    if (!hasFreshReverification) {
      return reverificationErrorResponse("strict");
    }

    const token = await getToken();

    if (!token) {
      return Response.json(
        {
          ok: false,
          error: "Mangler auth-token",
        },
        { status: 401 }
      );
    }

    const { organizationId } = await context.params;
    const bodyText = await request.text();

    const response = await fetch(`${API_URL}/organizations/${organizationId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });

    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[DELETE workspace] route error:", error);

    return Response.json(
      {
        ok: false,
        error: "Intern feil i delete-route",
      },
      { status: 500 }
    );
  }
}