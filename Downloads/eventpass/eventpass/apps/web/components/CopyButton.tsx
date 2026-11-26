"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={`Copier ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* presse-papiers indisponible : l'utilisateur peut sélectionner le texte */
        }
      }}
    >
      {done ? "Copié ✓" : "Copier"}
    </button>
  );
}
