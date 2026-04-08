import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import TrackedAccountsManager from "../../../components/TrackedAccountsManager";
import { getServerApiUrl } from "../../../lib/api";

const API_URL = getServerApiUrl();

type SocialAccount = {
  id: string;
  platform: "TIKTOK" | "INSTAGRAM";
  accountHandle: string;
  displayName: string | null;
  profileUrl: string | null;
  status: string;
  initialSyncStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  isActive: boolean;
  createdAt: string;
};

type SocialAccountsResponse = {
  ok: boolean;
  count: number;
  accounts: SocialAccount[];
  role: string | null;
  permissions: {
    canAddAccounts: boolean;
    canDeleteAccounts: boolean;
  };
  limits: {
    monthlyAccountAdds: number;
  };
  usage: {
    activeAccounts: number;
    accountsAddedThisPeriod: number;
    monthlyAddsRemaining: number;
    nextAvailableAddAt: string | null;
  };
};

type OrganizationsResponse = {
  ok: boolean;
  activeOrganizationId: string | null;
  organizations: Array<{
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
      subscription: {
        id: string;
        plan: string;
        status: string;
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
      } | null;
    };
    isActive: boolean;
  }>;
};

async function getAuthHeaders() {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("Fant ikke auth-token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getTrackedAccounts() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/social-accounts`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /social-accounts feilet:", res.status, text);
    throw new Error("Kunne ikke hente kontoer");
  }

  return res.json() as Promise<SocialAccountsResponse>;
}

async function getOrganizations() {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/organizations`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GET /organizations feilet:", res.status, text);
    throw new Error("Kunne ikke hente workspaces");
  }

  return res.json() as Promise<OrganizationsResponse>;
}

export default async function TrackedAccountsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const [trackedAccounts, organizations] = await Promise.all([
    getTrackedAccounts(),
    getOrganizations(),
  ]);

  const activeWorkspace = organizations.organizations.find(
    (item) => item.organization.id === organizations.activeOrganizationId
  );

  return (
    <TrackedAccountsManager
      initialAccounts={trackedAccounts.accounts}
      activeWorkspaceName={activeWorkspace?.organization.name ?? "Workspace"}
      monthlyAddLimit={trackedAccounts.limits.monthlyAccountAdds}
      initialAddsThisPeriod={trackedAccounts.usage.accountsAddedThisPeriod}
      nextAvailableAddAt={trackedAccounts.usage.nextAvailableAddAt}
      canAddAccounts={trackedAccounts.permissions.canAddAccounts}
      canDeleteAccounts={trackedAccounts.permissions.canDeleteAccounts}
      role={trackedAccounts.role}
    />
  );
}