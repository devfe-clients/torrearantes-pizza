import { useEffect, useRef } from "react";
import type { Order } from "./types";

let audio: HTMLAudioElement | null = null;

function playBell() {
  if (typeof window === "undefined") return;
  if (!audio) {
    audio = new Audio("/bell.mp3");
    audio.volume = 1.0;
  }
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function useNewOrderBell(orders: Order[]) {
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      orders.forEach((o) => knownIds.current.add(o.id));
      initialized.current = true;
      return;
    }
    let hasNew = false;
    orders.forEach((o) => {
      if (!knownIds.current.has(o.id)) {
        knownIds.current.add(o.id);
        hasNew = true;
      }
    });
    if (hasNew) playBell();
  }, [orders]);
}