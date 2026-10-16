import { useQuery } from "@tanstack/react-query";
import type { AuthState, Destination, Source } from "../../../shared/types";
import { api } from "./api";

export const useAuth = () =>
  useQuery({ queryKey: ["auth"], queryFn: () => api<AuthState>("/auth/state"), staleTime: 60_000 });
export const useSources = () => useQuery({ queryKey: ["sources"], queryFn: () => api<Source[]>("/sources") });
export const useDestinations = () =>
  useQuery({ queryKey: ["destinations"], queryFn: () => api<Destination[]>("/destinations") });
