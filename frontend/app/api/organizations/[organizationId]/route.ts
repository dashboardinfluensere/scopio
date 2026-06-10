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

    const backendUrl = `${API_URL}/organizations/${organizationId}`;

    const response = await fetch(backendUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });

    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      console.error("[DELETE workspace] Backend svarte ikke med JSON:", {
        backendUrl,
        status: response.status,
        contentType,
        responsePreview: responseText.slice(0, 500),
      });

      return Response.json(
        {
          ok: false,
          error:
            response.status === 404
              ? "Backend fant ikke organizations-routen. Sjekk backend/server.ts."
              : "Backend svarte med HTML i stedet for JSON. Sjekk backend-terminalen.",
          backendStatus: response.status,
        },
        { status: response.status || 500 }
      );
    }

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[DELETE workspace] route error:", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Intern feil i delete-route",
      },
      { status: 500 }
    );
  }
}