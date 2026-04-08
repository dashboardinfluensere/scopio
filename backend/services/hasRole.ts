import { MemberRole } from "@prisma/client";

export function hasRole(role: MemberRole, allowed: MemberRole[]) {
  return allowed.includes(role);
}