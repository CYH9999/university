import { QueryClient, useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { logApi } from "@/platform/tauri";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 0 },
    mutations: { retry: 0 },
  },
});

/** Every data query lives under ["data", ...] so a mutation can refresh the whole UI at once. */
export function useQ<T>(key: unknown[], fn: () => Promise<T>, opts: Omit<UseQueryOptions<T, Error, T, unknown[]>, "queryKey" | "queryFn"> = {}) {
  return useQuery<T, Error, T, unknown[]>({ queryKey: ["data", ...key], queryFn: fn, ...opts });
}

export function invalidateAll() {
  return queryClient.invalidateQueries({ queryKey: ["data"] });
}

export interface MutOptions<TRes> {
  success?: string | ((r: TRes) => string | null);
  onSuccess?: (r: TRes) => void;
  onError?: (e: unknown) => void;
  silent?: boolean;
  invalidate?: boolean;
}

export function useMut<TArgs, TRes>(fn: (a: TArgs) => Promise<TRes>, opts: MutOptions<TRes> = {}) {
  return useMutation<TRes, unknown, TArgs>({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.invalidate !== false) void invalidateAll();
      const msg = typeof opts.success === "function" ? opts.success(r) : opts.success;
      if (msg) toast.success(i18n.t(msg));
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      if (!opts.silent) toast.error(errorMessage(e));
      void logApi.write("error", `Mutation failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      opts.onError?.(e);
    },
  });
}
