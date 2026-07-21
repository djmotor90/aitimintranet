"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "aitim-nav-collapsed";

/**
 * Persist which sidebar tree nodes (spaces / folders) the user has collapsed.
 * Default is expanded; only collapsed ids are stored so new nodes start open.
 */
export function useNavCollapse() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) setCollapsed(new Set(ids.filter((x) => typeof x === "string")));
      }
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  }, [collapsed, ready]);

  const isExpanded = useCallback((key: string) => !collapsed.has(key), [collapsed]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Force a node open (e.g. when the active list lives under it). */
  const expand = useCallback((key: string) => {
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return { isExpanded, toggle, expand, ready };
}

export function spaceCollapseKey(spaceId: string) {
  return `space:${spaceId}`;
}

export function folderCollapseKey(folderId: string) {
  return `folder:${folderId}`;
}

/** Collapse key for the top-level Tasks nav section (all spaces). */
export function tasksRootCollapseKey() {
  return "tasks-root";
}
