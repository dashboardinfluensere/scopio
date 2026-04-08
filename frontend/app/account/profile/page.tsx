import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ProfileForm from "../../../components/ProfileForm";

type SubscriptionInfo = {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

type OrganizationItem = {
  membershipId: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    createdAt: string;
    updatedAt: string;
    memberCount: number;
    memberLimit: number;
    subscription: SubscriptionInfo;
  };
  isActive: boolean;
};

type ViewerResponse = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: string | null;
    authProviderId: string | null;
    activeOrganizationId: string | null;
  };
  organizations: Array<{
    membershipId: string;
    role: string;
    organization: {
      id: string;
      name: string;
      slug: string | null;
      createdAt: string;
      updatedAt: string;
      initialScrapeStartedAt: string | null;
      onboardingCompletedAt: string | null;
      socialAccountsCount: number;
      subscription: {
        id: string;
        plan: string;
        status: string;
        currentPeriodEnd: string | null;
      } | null;
    };
  }>;
  access?: {
    hasAccess?: boolean;
    requiresOnboarding?: boolean;
    requiresUpgrade?: boolean;
    requiresInitialAccountOnboarding?: boolean;
    isInitialScrapeRunning?: boolean;
  };
};

type OrganizationsResponse = {
  ok: boolean;
  activeOrganizationId: string | null;
  organizations: OrganizationItem[];
};

const API_URL = process.env.API_URL;

if (!API_URL) {
  throw new Error("API_URL mangler i frontend sitt server-miljø");
}

async function getAuthHeader() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("Mangler auth-token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getViewer(): Promise<ViewerResponse> {
  const headers = await getAuthHeader();

  const res = await fetch(`${API_URL}/me`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /me feilet:", res.status, text);
    throw new Error("Kunne ikke hente brukerdata");
  }

  return res.json();
}

async function getOrganizations(): Promise<OrganizationsResponse> {
  const headers = await getAuthHeader();

  const res = await fetch(`${API_URL}/organizations`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /organizations feilet:", res.status, text);
    throw new Error("Kunne ikke hente workspaces");
  }

  return res.json();
}

export default async function ProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const [viewer, organizationsResponse] = await Promise.all([
    getViewer(),
    getOrganizations(),
  ]);

  if (viewer.access?.requiresOnboarding) {
    redirect("/onboarding");
  }

  if (viewer.access?.requiresUpgrade) {
    redirect("/plans");
  }

  return (
    <ProfileForm
      initialName={viewer.user.name ?? ""}
      email={viewer.user.email}
      initialOrganizations={organizationsResponse.organizations ?? []}
      initialActiveOrganizationId={organizationsResponse.activeOrganizationId}
    />
  );
}