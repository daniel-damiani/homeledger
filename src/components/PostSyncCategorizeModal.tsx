"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CategorizeQueue } from "@/components/CategorizeQueue";

export type SyncQueueItem = {
  id: string;
  payee: string;
  date: string;
  amountCents: number;
  accountName: string;
  categoryId?: string | null;
  categoryName?: string | null;
};

export function PostSyncCategorizeModal({
  items: initialItems,
  onClose,
}: {
  items: SyncQueueItem[];
  onClose: () => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCats(true);
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: { id: string; name: string; isTransfer?: boolean }[]) => {
        if (cancelled || !Array.isArray(data)) return;
        setCategories(
          data.map((c) => ({
            id: c.id,
            name: c.isTransfer ? `${c.name} (transfer)` : c.name,
          }))
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingCats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onItemApplied = useCallback((txnId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== txnId));
  }, []);

  const onItemsApplied = useCallback((txnIds: string[]) => {
    const drop = new Set(txnIds);
    setItems((prev) => prev.filter((i) => !drop.has(i.id)));
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="drilldown-overlay" onClick={onClose} role="presentation">
      <div
        className="drilldown-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-categorize-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "42rem" }}
      >
        <header className="drilldown-head">
          <div>
            <h2 id="sync-categorize-title" className="drilldown-title" style={{ margin: 0 }}>
              Review new transactions
            </h2>
            <p className="drilldown-sub stat muted" style={{ margin: "0.35rem 0 0" }}>
              {items.length > 0
                ? `${items.length} just synced — auto-assigned categories are pre-filled; change any that look wrong and Apply.`
                : "All set — every new transaction is reviewed."}
            </p>
          </div>
          <button type="button" className="drilldown-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="drilldown-body">
          {loadingCats ? (
            <p className="stat muted">Loading categories…</p>
          ) : items.length === 0 ? (
            <p className="lede" style={{ margin: 0 }}>
              Nothing left to categorize. You can close this window.
            </p>
          ) : (
            <CategorizeQueue
              items={items}
              categories={categories}
              onItemApplied={onItemApplied}
              onItemsApplied={onItemsApplied}
              onQueueEmpty={onClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
