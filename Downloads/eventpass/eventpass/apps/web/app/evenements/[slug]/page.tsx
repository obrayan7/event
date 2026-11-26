import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MAX_SEATS_PER_ORDER, categoryColors, formatDate, formatPrice, getEventBySlug, getSeatMap, imageVariant } from "@rideau/db";
import { addSeatsToCart, addToCart } from "@/app/actions/cart";
import { Cover } from "@/components/Cover";
import { SeatPicker } from "@/components/SeatPicker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const event = await getEventBySlug(params.slug);
  if (!event) return {};
  return {
    title: event.title,
    description: event.description.slice(0, 155),
    openGraph: event.images[0] ? { images: [imageVariant(event.images[0].url, 800)] } : undefined,
  };
}

export default async function EventPage({ params, searchParams }: { params: { slug: string }; searchParams: { error?: string } }) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  const seated = event.seatingMode === "ASSIGNED";
  const seatMap = seated ? await getSeatMap(event.id) : [];
  const colors = categoryColors(event.ticketTypes);
  const categories = event.ticketTypes
    .filter((t) => seatMap.some((s) => s.categoryId === t.id))
    .map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, color: colors[t.id], free: seatMap.filter((s) => s.categoryId === t.id && s.status === "available").length }))
    .sort((a, b) => b.priceCents - a.priceCents);

  const [cover, ...others] = event.images;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt.toISOString(),
    location: { "@type": "Place", name: event.venue.name, address: `${event.venue.address}, ${event.venue.city}` },
    description: event.description,
    offers: event.ticketTypes.map((t) => ({
      "@type": "Offer",
      name: t.name,
      price: (t.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: t.available > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    })),
  };

  return (
    <div className="wrap event">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div>
        <span className="tag">{event.category.name}</span>
        <h1>{event.title}</h1>
        <div className="facts">
          <span>{formatDate(event.startsAt, true)}</span>
          <span>{event.venue.name}, {event.venue.address}, {event.venue.city}</span>
        </div>
        {!cover && <div className="cover-fallback"><Cover category={event.category.slug} /></div>}
        {cover && (
          <div className="gallery">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageVariant(cover.url, 1600)} alt={cover.alt ?? event.title} />
            {others.length > 0 && (
              <div className="thumbs">
                {others.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={img.id} src={imageVariant(img.url, 400)} alt={img.alt ?? event.title} loading="lazy" />
                ))}
              </div>
            )}
          </div>
        )}
        <p style={{ whiteSpace: "pre-line", marginTop: 24, maxWidth: "65ch" }}>{event.description}</p>
      </div>

      <aside className="panel" aria-labelledby="billets">
        <h2 id="billets">Billets</h2>
        {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
        {seated ? (
          categories.length === 0 ? (
            <p>La billetterie n&apos;est pas encore ouverte.</p>
          ) : (
            <>
              {categories.map((c) => (
                <div className="tt" key={c.id}>
                  <div><strong><span className="swatch" style={{ background: c.color }} aria-hidden="true" /> {c.name}</strong>{c.free === 0 ? <small className="soldout">Complet</small> : <small>{c.free} place{c.free > 1 ? "s" : ""} disponible{c.free > 1 ? "s" : ""}</small>}</div>
                  <strong>{formatPrice(c.priceCents)}</strong>
                </div>
              ))}
              <a className="btn" href="#plan" style={{ width: "100%", marginTop: 12 }}>Choisir mes places sur le plan</a>
            </>
          )
        ) : event.ticketTypes.length === 0 ? (
          <p>La billetterie n&apos;est pas encore ouverte.</p>
        ) : (
          <form action={addToCart.bind(null, event.slug)}>
            {event.ticketTypes.map((t) => {
              const max = Math.min(t.maxPerOrder, t.available);
              return (
                <div className="tt" key={t.id}>
                  <div>
                    <strong id={`tt-${t.id}`}>{t.name}</strong>
                    {t.description && <small>{t.description}</small>}
                    <small>{formatPrice(t.priceCents)}</small>
                    {t.available === 0 ? <small className="soldout">Complet</small> : t.available <= 10 ? <small>Plus que {t.available} places</small> : null}
                  </div>
                  {t.available > 0 && (
                    <input type="number" name={`qty_${t.id}`} min={0} max={max} defaultValue={0} aria-labelledby={`tt-${t.id}`} style={{ width: 80 }} />
                  )}
                </div>
              );
            })}
            <button type="submit" style={{ width: "100%", marginTop: 12 }} disabled={event.ticketTypes.every((t) => t.available === 0)}>
              Ajouter au panier
            </button>
            <p className="hint" style={{ margin: "10px 0 0" }}>Vos places sont réservées 15 minutes une fois ajoutées au panier.</p>
          </form>
        )}
      </aside>

      {seated && categories.length > 0 && (
        <section id="plan" className="seat-section" aria-labelledby="plan-title">
          <h2 id="plan-title">Choisissez vos places</h2>
          <SeatPicker seats={seatMap} categories={categories} maxSeats={MAX_SEATS_PER_ORDER} action={addSeatsToCart.bind(null, event.slug)} />
        </section>
      )}
    </div>
  );
}
