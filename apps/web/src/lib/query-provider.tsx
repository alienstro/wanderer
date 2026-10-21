"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { MeResponse } from "@wanderer/shared";
import { type ReactNode, useState } from "react";
import { ApiError, apiFetch } from "./api";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
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
