"use client";

import { useEffect, useRef } from "react";

const IDLE_MS = 15 * 60 * 1000;
const TOUCH_MS = 60 * 1000;
const CHECK_MS = 15 * 1000;

async function lockNow() {
  try {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
  } catch {
    // Still send them to unlock.
  }
  window.location.assign("/unlock");
}

/**
 * Locks after 15 minutes idle or 15 minutes with the tab hidden.
 * Activity also slides the server JWT via /api/auth/touch.
 */
export function IdleLock() {
  const lastActivity = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);
  const lastTouch = useRef(0);
  const locking = useRef(false);

  useEffect(() => {
    const mark = () => {
      lastActivity.current = Date.now();
    };

    const maybeTouch = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible") return;
      if (now - lastTouch.current < TOUCH_MS) return;
      lastTouch.current = now;
      void fetch("/api/auth/touch", { method: "POST" }).then((res) => {
        if (res.status === 401 && !locking.current) {
          locking.current = true;
          void lockNow();
        }
      });
    };

    const onActivity = () => {
      mark();
      maybeTouch();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const hid = hiddenAt.current;
      hiddenAt.current = null;
      if (hid != null && Date.now() - hid >= IDLE_MS) {
        if (!locking.current) {
          locking.current = true;
          void lockNow();
        }
        return;
      }
      mark();
      maybeTouch();
    };

    const tick = () => {
      if (locking.current) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity.current >= IDLE_MS) {
        locking.current = true;
        void lockNow();
      }
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll"];
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(tick, CHECK_MS);
    maybeTouch();

    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
