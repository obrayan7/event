import fs from "fs";
import sharp from "sharp";
import { buildTicketsPdf, type TicketForPdf } from "../lib/ticket-pdf";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d8d"/><stop offset="1" stop-color="#3a2a9c"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><g fill="#fff" opacity=".2"><polygon points="200,-10 70,300 140,300"/><polygon points="200,-10 260,300 330,300"/></g><circle cx="120" cy="130" r="60" fill="#fff" opacity=".9"/><path d="M0 300V262q18-26 36 0t36 0 36-8 36 8 36-6 36 6 36-8 36 8 36-4 36 4 36-6 36 6V300z" fill="#14131f"/></svg>`;
(async () => {
  await sharp(Buffer.from(svg)).resize(1180, 800, { fit: "cover" }).webp().toFile("public/uploads/sample-1600.webp");
  const base: TicketForPdf = {
    code: "kQ3x9Tz2LmVb7RnYc0WaHj4e", number: "EV202608230045", seat: "B12",
    eventTitle: "Festival Afro Vibes", startsAt: new Date("2026-08-23T18:00:00Z"), organizer: "EventPro",
    venueName: "Palais des Congrès de Cotonou", city: "Cotonou", country: "Bénin",
    ticketTypeName: "VIP", holder: "BRUN Isidore Roméo", orderRef: "7K2M9QXA", imageUrl: "/uploads/sample-1600.webp",
  };
  const pdf = await buildTicketsPdf([
    base,
    { ...base, number: "EV202612060012", seat: null, imageUrl: null, organizer: null, eventTitle: "Le Grand Gala de la Musique Africaine Contemporaine de l'Année", ticketTypeName: "Placement libre", holder: "Marie-Christine de la Fontaine-Beauregard" },
  ]);
  fs.writeFileSync("exemple-billets.pdf", pdf);
  fs.rmSync("public/uploads/sample-1600.webp");
  console.log("PDF ok", pdf.length, "octets");
})();
