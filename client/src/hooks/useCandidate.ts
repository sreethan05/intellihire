import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { candidateApi } from "../lib/api.js";

export function useCandidateProfile() {
  return useQuery({
    queryKey: ["candidate", "profile"],
    queryFn: async () => {
      const res = await candidateApi.getProfile();
      return res.data;
    },
  });
}

export function useCandidateDashboard() {
  return useQuery({
    queryKey: ["candidate", "dashboard"],
    queryFn: async () => {
      const res = await candidateApi.getDashboard();
      return res.data;
    },
    staleTime: 60 * 1000, // 1 minute stale time
  });
}

export function useUpdateCandidateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await candidateApi.updateProfile(data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", "dashboard"] });
    },
  });
}

export function useCompleteCandidateOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await candidateApi.completeOnboarding(data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", "dashboard"] });
    },
  });
}
