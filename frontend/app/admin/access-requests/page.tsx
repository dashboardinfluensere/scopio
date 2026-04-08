import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApiUrl } from "../../../lib/api";
import AccessRequestsTable from "./AccessRequestsTable";

const API_URL = getServerApiUrl();

type AccessRequestItem = {
  id: string;
  email: string;
  workspaceName: string;
  selectedPlan: "PRO" | "BUSINESS";
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

type AccessRequestsResponse = {
  ok: boolean;
  accessRequests: AccessRequestItem[];
  error?: string;
};

async function getAccessRequests(): Promise<AccessRequestsResponse> {
  const authData = await auth();

  if (!authData.userId) {
    redirect("/sign-in");
  }

  const token = await authData.getToken();

  const res = await fetch(`${API_URL}/access-requests`, {
    cache: "no-store",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  const data = (await res.json().catch(() => null)) as
    | AccessRequestsResponse
    | null;

  if (res.status === 401) {
    redirect("/sign-in");
  }

  if (res.status === 403) {
    return {
      ok: false,
      accessRequests: [],
      error: "Du har ikke tilgang til denne siden.",
    };
  }

  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      accessRequests: [],
      error: data?.error ?? "Kunne ikke hente forespørsler.",
    };
  }

  return data;
}

export default async function AdminAccessRequestsPage() {
  const data = await getAccessRequests();

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-6 py-10 text-[#0F172A] lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#FF6A3D]">
            Admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
            Tilgangsforespørsler
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#64748B]">
            Her kan du godkjenne eller avslå nye forespørsler.
          </p>
        </div>

        {!data.ok ? (
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
            <p className="text-sm text-[#B91C1C]">
              {data.error ?? "Noe gikk galt."}
            </p>
          </div>
        ) : (
          <AccessRequestsTable initialAccessRequests={data.accessRequests} />
        )}
      </div>
    </main>
  );
}