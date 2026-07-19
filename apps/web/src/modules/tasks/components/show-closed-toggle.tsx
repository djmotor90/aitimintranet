"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { saveListViewPrefs } from "../actions";

/**
 * ClickUp-style control: closed tasks (status category done/cancelled) are
 * hidden by default. Toggle sets URL `closed=1` so the server re-queries.
 * When a named view is active, the preference is also saved on that view.
 */
export function ShowClosedToggle({
  showClosed,
  listId,
  viewId,
}: {
  showClosed: boolean;
  listId?: string;
  viewId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !showClosed;
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("closed", "1");
    else params.delete("closed");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?");
    if (listId && viewId) {
      startTransition(() => {
        void saveListViewPrefs(listId, { viewId, showClosed: next });
      });
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={showClosed ? "secondary" : "outline"}
            size="sm"
            onClick={toggle}
            aria-pressed={showClosed}
            aria-label={showClosed ? "Hide closed tasks" : "Show closed tasks"}
            className={cn("gap-1.5", showClosed && "text-foreground")}
          >
            {showClosed ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">
              {showClosed ? "Closed" : "Closed"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {showClosed
            ? "Hide closed tasks (Done / Cancelled)"
            : "Show closed tasks (Done / Cancelled)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
