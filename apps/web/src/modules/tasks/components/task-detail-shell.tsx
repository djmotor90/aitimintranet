"use client";

import { ListFilter, PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY = "aitim:task-detail-activity-visible";

export function TaskDetailShell({
  children,
  activity,
}: {
  children: ReactNode;
  activity: ReactNode;
}) {
  const [activityVisible, setActivityVisible] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return;
    const timeout = window.setTimeout(() => setActivityVisible(saved === "true"), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function setVisible(visible: boolean) {
    setActivityVisible(visible);
    window.localStorage.setItem(STORAGE_KEY, String(visible));
  }

  if (!activityVisible) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setVisible(true)}>
            <PanelRightOpen className="size-4" />
            Activity
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      {children}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        <Card className="min-h-0 flex-1">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Activity</CardTitle>
            <CardAction className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <ListFilter className="size-4" />
                Filter
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Hide activity"
                title="Hide activity"
                onClick={() => setVisible(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-5">{activity}</CardContent>
        </Card>
      </aside>
    </div>
  );
}
