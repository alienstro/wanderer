"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { MeResponse } from "@wanderer/shared";
import { type ReactNode, useState } from "react";
import { ApiError, apiFetch } from "./api";

const MAX_RETRIES = 2;

/** A 4xx answer is final, so a retry only delays the error. A network error or a 5xx answer can pass on a retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetry } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The logged-in user, or null when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await apiFetch<MeResponse>("/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });
}
