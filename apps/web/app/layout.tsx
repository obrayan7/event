import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import Link from "next/link";
import { CookieBanner } from "@/components/CookieBanner";
import { getCart } from "@/lib/cart";
import { getCustomer } from "@/lib/customer-auth";
import { siteLogo, siteName } from "@/lib/site";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["700", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export function generateMetadata(): Metadata {
  const name = siteName();
  return {
    title: { default: `${name} — billetterie de spectacles`, template: `%s — ${name}` },
    description: "Concerts, théâtre, humour, sport : trouvez votre prochaine sortie et réservez vos billets en ligne.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cart, customer] = await Promise.all([getCart(), getCustomer()]);
  const count = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className={siteLogo() ? "brand has-logo" : "brand"} aria-label={siteName()}>
              {siteLogo() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={siteLogo()} alt={siteName()} width={207} height={40} />
              ) : siteName()}
            </Link>
            <nav className="nav" aria-label="Navigation principale">
              <Link href="/">Spectacles</Link>
              <Link href="/panier">Panier{count > 0 ? ` (${count})` : ""}</Link>
              <Link href={customer ? "/compte" : "/compte/connexion"}>{customer ? "Mon compte" : "Connexion"}</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <span>© {new Date().getFullYear()} {siteName()}</span>
            <nav aria-label="Informations légales">
              <Link href="/mentions-legales">Mentions légales</Link>
              <Link href="/cgv">CGV</Link>
              <Link href="/confidentialite">Confidentialité</Link>
              <Link href="/cookies">Cookies</Link>
            </nav>
          </div>
        </footer>
        <CookieBanner />
      </body>
    </html>
  );
}
