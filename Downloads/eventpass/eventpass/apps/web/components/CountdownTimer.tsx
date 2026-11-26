"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Compte à rebours de la réservation ; à zéro, la page est rechargée (le panier est alors vide). */
export function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((target - Date.now()) / 1000)));

  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(id);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, router]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <p className="timer" role="timer" aria-live="off">
      Places réservées pendant <strong>{mm}:{ss}</strong>
    </p>
  );
}
