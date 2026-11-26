import type { CSSProperties } from "react";
import Link from "next/link";
import { listEvents, prisma, type EventFilters } from "@rideau/db";
import { HomeMotion } from "@/components/HomeMotion";
import { TicketCard } from "@/components/TicketCard";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const MARQUEE = ["Concerts", "Théâtre", "Humour", "Sport", "Festivals", "Ciné-concert"];

function toFilters(sp: SP): EventFilters {
  return {
    q: sp.q?.trim() || undefined,
    city: sp.ville || undefined,
    category: sp.categorie || undefined,
    from: sp.du || undefined,
    to: sp.au || undefined,
    maxPrice: sp.prix ? Number(sp.prix) : undefined,
    sort: sp.tri === "prix" ? "prix" : "date",
    page: sp.page ? Number(sp.page) : 1,
  };
}

function href(sp: SP, patch: SP) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({ searchParams }: { searchParams: SP }) {
  const [categories, venues, result] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.venue.findMany({ select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
    listEvents(toFilters(searchParams)),
  ]);
  const pages = Math.ceil(result.total / result.pageSize);

  return (
    <>
      <HomeMotion key={JSON.stringify(searchParams)} />
      <section className="hero-dark" data-hero>
        <div className="hero-bg" aria-hidden="true">
          <div className="hb hb-scene" />
          <div className="hb hb-beams" />
          <div className="hb hb-shade" />
        </div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="kicker">Billetterie en ligne</span>
            <h1>Vivez la <em>scène</em>.<br />Réservez en 3&nbsp;clics.</h1>
            <p>Concerts, théâtre, humour, sport : choisissez votre soirée, payez en toute sécurité et recevez vos billets par e-mail.</p>
            <form className="search" role="search" action="/">
              <input type="search" name="q" defaultValue={searchParams.q} placeholder="Artiste, spectacle, salle ou ville" aria-label="Rechercher un spectacle" />
              <button type="submit">Rechercher</button>
            </form>
            <ul className="trust">
              <li>Paiement sécurisé</li>
              <li>Billets par e-mail</li>
              <li>Places réservées 15 min</li>
            </ul>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="scene3d">
              {([["hv-1", "/img/affiche-1.jpg", 350, 524], ["hv-3", "/img/affiche-2.jpg", 399, 501], ["hv-2", "/img/affiche-3.jpg", 547, 365]] as const).map(([cls, src, w, h]) => (
                <div className={`hv ${cls}`} key={cls}>
                  <div className="hv-face">
                    <img src={src} width={w} height={h} alt="" decoding="async" />
                    <span className="hv-shine" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <a className="scroll-cue" href="#spectacles" aria-label="Voir les spectacles"><span /></a>
      </section>

      <div className="marquee-clip" aria-hidden="true">
        <div className="marquee">
          <div className="marquee-track">
            {[0, 1].map((g) => (
              <div className="marquee-group" key={g}>
                {[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>{t}<b>✦</b></span>)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap" id="spectacles">
      <h2 className="section-title reveal">À l&apos;affiche</h2>
      <nav className="chips" aria-label="Catégories">
        <Link className="chip" href={href(searchParams, { categorie: undefined, page: undefined })} aria-current={!searchParams.categorie}>Tout</Link>
        {categories.map((c) => (
          <Link key={c.id} className="chip" href={href(searchParams, { categorie: c.slug, page: undefined })} aria-current={searchParams.categorie === c.slug}>
            {c.name}
          </Link>
        ))}
      </nav>

      <form className="filters" action="/">
        {searchParams.q && <input type="hidden" name="q" value={searchParams.q} />}
        {searchParams.categorie && <input type="hidden" name="categorie" value={searchParams.categorie} />}
        <label>Ville
          <select name="ville" defaultValue={searchParams.ville ?? ""}>
            <option value="">Toutes</option>
            {venues.map((v) => <option key={v.city} value={v.city}>{v.city}</option>)}
          </select>
        </label>
        <label>Du <input type="date" name="du" defaultValue={searchParams.du} /></label>
        <label>Au <input type="date" name="au" defaultValue={searchParams.au} /></label>
        <label>Prix max (€) <input type="number" name="prix" min={0} step={1} defaultValue={searchParams.prix} style={{ width: 110 }} /></label>
        <label>Trier par
          <select name="tri" defaultValue={searchParams.tri ?? "date"}>
            <option value="date">Date</option>
            <option value="prix">Prix</option>
          </select>
        </label>
        <button type="submit" className="btn-ghost btn">Filtrer</button>
      </form>

      <p className="result-count" aria-live="polite">
        {result.total === 0 ? "Aucun spectacle" : `${result.total} spectacle${result.total > 1 ? "s" : ""}`}
      </p>

      {result.events.length === 0 ? (
        <div className="empty">
          <p>Aucun spectacle ne correspond à ces critères. Élargissez les dates ou retirez un filtre.</p>
          <Link className="btn btn-ghost" href="/">Réinitialiser</Link>
        </div>
      ) : (
        <div className="grid">
          {result.events.map((e, i) => (
            <TicketCard
              key={e.id}
              slug={e.slug}
              title={e.title}
              startsAt={e.startsAt}
              venueName={e.venue.name}
              city={e.venue.city}
              categoryName={e.category.name}
              categorySlug={e.category.slug}
              coverUrl={e.images[0]?.url}
              coverAlt={e.images[0]?.alt}
              fromPriceCents={e.fromPriceCents}
              index={i}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          {result.page > 1 && <Link className="btn btn-ghost" href={href(searchParams, { page: String(result.page - 1) })}>Précédent</Link>}
          <span style={{ alignSelf: "center" }}>Page {result.page} sur {pages}</span>
          {result.page < pages && <Link className="btn btn-ghost" href={href(searchParams, { page: String(result.page + 1) })}>Suivant</Link>}
        </nav>
      )}
      </div>
      <div className="wrap">
      <section className="steps" aria-labelledby="steps-title">
        <h2 id="steps-title" className="section-title reveal">Réserver, <em>tout simplement</em></h2>
        <ol className="steps-list">
          <li className="step reveal" style={{ "--i": 0 } as CSSProperties}><span className="step-n">1</span><h3>Choisissez</h3><p>Parcourez les spectacles, filtrez par ville, date ou prix et trouvez la soirée qui vous plaît.</p></li>
          <li className="step reveal" style={{ "--i": 1 } as CSSProperties}><span className="step-n">2</span><h3>Réservez</h3><p>Vos places sont gardées 15 minutes le temps de régler, en toute sécurité.</p></li>
          <li className="step reveal" style={{ "--i": 2 } as CSSProperties}><span className="step-n">3</span><h3>Profitez</h3><p>Vos billets arrivent par e-mail, à présenter sur votre téléphone à l&apos;entrée.</p></li>
        </ol>
      </section>
      </div>
    </>
  );
}
