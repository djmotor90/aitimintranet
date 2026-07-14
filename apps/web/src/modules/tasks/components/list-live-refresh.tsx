"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the page when someone else updates this list (via SSE). */
export function ListLiveRefresh({ listId }: { listId: string }) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(`/api/sse?listId=${listId}`);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("list", () => {
      // debounce bursts of updates
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => router.refresh(), 400);
    });
    return () => {
      if (timeout) clearTimeout(timeout);
      es.close();
    };
  }, [listId, router]);
  return null;
}
