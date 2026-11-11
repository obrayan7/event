import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal";

export function generateStaticParams() {
  return Object.keys(LEGAL).map((page) => ({ page }));
}

export function generateMetadata({ params }: { params: { page: string } }) {
  const doc = LEGAL[params.page];
  return doc ? { title: doc.title } : {};
}

/** Rendu minimal du texte (titres « ## », listes « - », gras **…**) sans dépendance externe. */
function render(body: string) {
  return body.split("\n\n").map((block, i) => {
    if (block.startsWith("## ")) return <h2 key={i}>{block.slice(3)}</h2>;
    const lines = block.split("\n");
    const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/).map((p, n) => (p.startsWith("**") ? <strong key={n}>{p.slice(2, -2)}</strong> : p));
    if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, n) => <li key={n}>{inline(l.slice(2))}</li>)}</ul>;
    if (lines[0].startsWith("## ")) {
      return <div key={i}><h2>{lines[0].slice(3)}</h2><p style={{ whiteSpace: "pre-line" }}>{inline(lines.slice(1).join("\n"))}</p></div>;
    }
    return <p key={i} style={{ whiteSpace: "pre-line" }}>{inline(block)}</p>;
  });
}

export default function LegalPageView({ params }: { params: { page: string } }) {
  const doc = LEGAL[params.page];
  if (!doc) notFound();
  return (
    <div className="wrap page legal">
      <h1>{doc.title}</h1>
      {render(doc.body)}
    </div>
  );
}
