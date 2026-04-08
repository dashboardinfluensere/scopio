import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApiUrl } from "../../lib/api";

const API_URL = getServerApiUrl();

type ViewerResponse = {
  ok: boolean;
  access?: {
    hasAccess?: boolean;
    requiresOnboarding?: boolean;
    requiresUpgrade?: boolean;
    requiresAccessRequest?: boolean;
  };
};

async function getViewer() {
  const authData = await auth();
  const token = await authData.getToken();

  const res = await fetch(`${API_URL}/me`, {
    cache: "no-store",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  if (!res.ok) {
    throw new Error(`Kunne ikke hente brukerdata. Status: ${res.status}`);
  }

  return res.json() as Promise<ViewerResponse>;
}

export default async function OnboardingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  try {
    const viewer = await getViewer();

    if (viewer.access?.hasAccess) {
      redirect("/dashboard");
    }

    if (viewer.access?.requiresOnboarding || viewer.access?.requiresUpgrade) {
      redirect("/plans");
    }

    if (viewer.access?.requiresAccessRequest) {
      redirect("/request-access");
    }

    redirect("/request-access");
  } catch {
    redirect("/request-access");
  }
}