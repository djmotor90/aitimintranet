"use client";

import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aitim:task-detail-activity-visible";

export function TaskDetailShell({
  children,
  activity,
}: {
  children: ReactNode;
  activity: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === "true");
    setMounted(true);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    // Shell fills the full height of <main> so each column manages its own scroll
    <div className="flex h-full min-h-0">

      {/* ── center — scrolls independently ── */}
      <div className="min-w-0 flex-1 overflow-y-auto pr-6">
        {children}
      </div>

      {/* ── right panel ── */}
      <div className="relative flex h-full flex-shrink-0">

        {/* persistent separator */}
        <div className="absolute inset-y-0 left-0 border-l" />

        {/* toggle tab — always on the left border edge */}
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Hide activity" : "Show activity"}
          title={open ? "Hide activity" : "Show activity"}
          className={cn(
            "absolute top-6 left-0 z-10 -translate-x-full",
            "flex h-8 w-3.5 items-center justify-center",
            "rounded-l-md border border-r-0 bg-card shadow-sm",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          )}
        >
          {open
            ? <ChevronRight className="size-3 shrink-0" />
            : <ChevronLeft className="size-3 shrink-0" />}
        </button>

        {/* sliding wrapper — overflow:clip clips without breaking any scroll context */}
        <div
          style={{ overflow: "clip" }}
          className={cn(
            "h-full transition-all duration-300 ease-in-out",
            mounted
              ? open ? "w-[360px] xl:w-[400px] opacity-100" : "w-0 opacity-0 pointer-events-none"
              : "w-[360px] xl:w-[400px] opacity-100",
          )}
        >
          {/* aside fills full panel height — no sticky needed */}
          <aside className="flex h-full w-[360px] xl:w-[400px] flex-col pl-6">
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardHeader className="shrink-0 border-b">
                <CardTitle className="text-base">Activity</CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                    <ListFilter className="size-4" />
                    Filter
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-5">
                {activity}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
