"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "cookie-notice-v1";

/**
 * Le site n'utilise que des cookies strictement nécessaires (session, panier) : pas de consentement requis,
 * mais l'information est affichée. Si des mesures d'audience ou de la publicité sont ajoutées plus tard,
 * transformer ce bandeau en vrai recueil de consentement (accepter / refuser) avant de les charger.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(!localStorage.getItem(KEY)); } catch { setVisible(true); }
  }, []);
  if (!visible) return null;
  return (
    <div className="cookie" role="region" aria-label="Cookies">
      <p>Ce site utilise uniquement des cookies nécessaires à son fonctionnement (connexion, panier). <Link href="/cookies">En savoir plus</Link></p>
      <button type="button" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch {} setVisible(false); }}>
        J&apos;ai compris
      </button>
    </div>
  );
}
