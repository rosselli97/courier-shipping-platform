import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { UserPublic } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<UserPublic | null>("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
}
