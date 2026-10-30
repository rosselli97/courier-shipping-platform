import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Contact } from "./types";

/** Logged-in user's address book, most used first. */
export function useContacts(enabled: boolean) {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: () => apiGet<Contact[]>("/contacts"),
    enabled,
    staleTime: 30_000,
  });
}
