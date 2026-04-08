"use client";

import { useAuth } from "@clerk/nextjs";

export function useAuthedFetch() {
  const { getToken } = useAuth();

  return async function authedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
  ) {
    const token = await getToken();

    if (!token) {
      throw new Error("Ikke autentisert");
    }

    const headers = new Headers(init.headers ?? {});

    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };
}