/**
 * Illustrations originales (SVG) utilisées quand un événement n'a pas encore de photo,
 * et dans l'en-tête de l'accueil. Une par grande catégorie.
 */
const KINDS = ["concerts", "theatre", "humour", "sport"] as const;
type Kind = (typeof KINDS)[number];

const svgProps = { viewBox: "0 0 400 300", preserveAspectRatio: "xMidYMid slice", "aria-hidden": true, focusable: false, style: { display: "block", width: "100%", height: "100%" } } as const;

export function coverKind(slug?: string | null): Kind {
  return (KINDS as readonly string[]).includes(slug ?? "") ? (slug as Kind) : "concerts";
}

export function Cover({ category }: { category?: string | null }) {
  const kind = coverKind(category);

  if (kind === "theatre") {
    return (
      <svg {...svgProps}>
        <defs><linearGradient id="cv-th" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d62f6b" /><stop offset="1" stopColor="#7a1233" /></linearGradient></defs>
        <rect width="400" height="300" fill="url(#cv-th)" />
        <polygon points="200,0 110,262 290,262" fill="#fff" opacity=".18" />
        <path d="M0 0h150q-34 130 0 300H0z" fill="#5a0f2a" />
        <path d="M400 0h-150q34 130 0 300h150z" fill="#5a0f2a" />
        <path d="M40 0q10 150-6 300M80 0q12 150-6 300M360 0q-10 150 6 300M320 0q-12 150 6 300" stroke="#fff" strokeOpacity=".12" strokeWidth="3" fill="none" />
        <rect y="262" width="400" height="38" fill="#2a0a18" />
        <ellipse cx="200" cy="264" rx="92" ry="12" fill="#fff" opacity=".4" />
      </svg>
    );
  }
  if (kind === "humour") {
    return (
      <svg {...svgProps}>
        <defs><linearGradient id="cv-hu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f8a94" /><stop offset="1" stopColor="#0b3b40" /></linearGradient></defs>
        <rect width="400" height="300" fill="url(#cv-hu)" />
        <polygon points="200,0 95,300 305,300" fill="#fff" opacity=".13" />
        <circle cx="200" cy="120" r="32" fill="#fff" />
        <path d="M176 112h48M176 124h48" stroke="#0b3b40" strokeWidth="3" opacity=".4" />
        <rect x="188" y="146" width="24" height="64" rx="12" fill="#e8e6f5" />
        <rect x="197" y="210" width="6" height="52" fill="#e8e6f5" />
        <ellipse cx="200" cy="266" rx="42" ry="8" fill="#e8e6f5" />
      </svg>
    );
  }
  if (kind === "sport") {
    return (
      <svg {...svgProps}>
        <defs><linearGradient id="cv-sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b3a5c" /><stop offset="1" stopColor="#14131f" /></linearGradient></defs>
        <rect width="400" height="300" fill="url(#cv-sp)" />
        <g stroke="#fff" strokeOpacity=".35" strokeWidth="3" fill="none">
          <rect x="40" y="30" width="320" height="240" rx="10" />
          <line x1="200" y1="30" x2="200" y2="270" />
          <circle cx="200" cy="150" r="64" />
        </g>
        <circle cx="200" cy="150" r="30" fill="#d62f6b" />
        <path d="M170 150h60M200 120v60" stroke="#fff" strokeWidth="3" opacity=".55" />
      </svg>
    );
  }
  return (
    <svg {...svgProps}>
      <defs><linearGradient id="cv-co" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4d8d" /><stop offset="1" stopColor="#3a2a9c" /></linearGradient></defs>
      <rect width="400" height="300" fill="url(#cv-co)" />
      <g fill="#fff" opacity=".2"><polygon points="200,-10 70,300 140,300" /><polygon points="200,-10 260,300 330,300" /></g>
      <circle cx="200" cy="118" r="44" fill="#fff" opacity=".92" />
      <path d="M0 300V262q18-26 36 0t36 0 36-8 36 8 36-6 36 6 36-8 36 8 36-4 36 4 36-6 36 6V300z" fill="#14131f" />
    </svg>
  );
}
