"use client";

import { useEffect } from "react";
import { initHomeMotion } from "@/lib/home-motion";

/** Active les animations de l'accueil (voir lib/home-motion.ts). Ne rend rien. */
export function HomeMotion() {
  useEffect(() => initHomeMotion(), []);
  return null;
}
