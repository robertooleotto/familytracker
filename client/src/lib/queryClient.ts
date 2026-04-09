import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthHeaders, getAuthHeadersAsync, refreshSessionToken } from "./auth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message: string;
    try {
      const data = await res.json();
      message = data.message || data.error || res.statusText;
    } catch {
      message = `${res.status}: ${res.statusText}`;
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  // Refresh token proactively if it's about to expire
  const headers: Record<string, string> = {
    ...(await getAuthHeadersAsync()),
  };
  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  // If we still got a 401, attempt one refresh and retry
  if (res.status === 401) {
    const refreshed = await refreshSessionToken();
    if (refreshed) {
      const retryHeaders: Record<string, string> = { ...getAuthHeaders() };
      if (data !== undefined) retryHeaders["Content-Type"] = "application/json";
      const retryRes = await fetch(url, {
        method,
        headers: retryHeaders,
        body: data !== undefined ? JSON.stringify(data) : undefined,
      });
      await throwIfResNotOk(retryRes);
      return retryRes;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = Array.isArray(queryKey)
      ? queryKey.filter(Boolean).join("/")
      : String(queryKey);

    // Refresh proactively before queries too
    const headers = await getAuthHeadersAsync();
    const res = await fetch(url, { headers });

    // Retry on 401 with a fresh token
    if (res.status === 401) {
      const refreshed = await refreshSessionToken();
      if (refreshed) {
        const retryRes = await fetch(url, { headers: getAuthHeaders() });
        if (unauthorizedBehavior === "returnNull" && retryRes.status === 401) {
          return null;
        }
        await throwIfResNotOk(retryRes);
        return await retryRes.json();
      }
      if (unauthorizedBehavior === "returnNull") return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
