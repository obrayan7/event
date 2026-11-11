import Link from "next/link";
import { listEvents, prisma, type EventFilters } from "@rideau/db";
import { Cover } from "@/components/Cover";
import { TicketCard } from "@/components/TicketCard";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

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
      <section className="hero-dark">
        <div className="wrap hero-grid">
          <div>
            <span className="kicker">Billetterie en ligne</span>
            <h1>Vivez la <em>scène</em>.<br />Réservez en 3 clics.</h1>
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
            <div className="hv hv-1"><Cover category="theatre" /></div>
            <div className="hv hv-2"><Cover category="humour" /></div>
            <div className="hv hv-3"><Cover category="concerts" /></div>
          </div>
        </div>
      </section>

      <div className="wrap">
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
          {result.events.map((e) => (
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
    </>
  );
}
