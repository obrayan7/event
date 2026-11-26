/** Nom du site : défini UNE seule fois, par la variable d’environnement SITE_NAME (valeur par défaut : « Eventpass »). */
export const siteName = () => process.env.SITE_NAME?.trim() || "Eventpass";

/**
 * Logo : « /logo.png » par défaut (fichier du dossier public, généré par « npm run brand:build »).
 * SITE_LOGO peut pointer vers un autre fichier ou une adresse complète ; SITE_LOGO=none affiche le nom en texte.
 */
export const siteLogo = () => {
  const v = process.env.SITE_LOGO?.trim();
  if (v === "none") return "";
  return v || "/logo.png";
};
