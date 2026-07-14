"use client";

import { useEffect, useState } from "react";

/** Unread count chip; refreshes on SSE `notification` events. */
export function NotificationBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetch("/api/notifications/count")
        .then((r) => r.json())
        .then((d) => active && setCount(d.count ?? 0))
        .catch(() => {});
    refresh();

    const es = new EventSource("/api/sse");
    es.addEventListener("notification", refresh);
    return () => {
      active = false;
      es.close();
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
