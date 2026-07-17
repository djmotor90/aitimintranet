"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveListViewPrefs } from "../actions";

export function ViewToggle({ listId, view }: { listId: string; view: "table" | "board" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function switchView(next: "table" | "board") {
    if (next === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "table") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    router.push(`?${params.toString()}`);
    startTransition(() => { saveListViewPrefs(listId, { view: next }); });
  }

  return (
    <div className="flex rounded-md border p-0.5">
      <Button
        type="button"
        variant={view === "board" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => switchView("board")}
      >
        Board
      </Button>
      <Button
        type="button"
        variant={view === "table" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => switchView("table")}
      >
        Table
      </Button>
    </div>
  );
}
