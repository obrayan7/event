/**
 * Animations de la page d'accueil (aucune bibliothèque) :
 *  1. apparition progressive des blocs au défilement (.reveal)
 *  2. parallaxe du décor + légère inclinaison 3D des billets du haut de page ([data-hero])
 *  3. inclinaison 3D et reflet des cartes de spectacle au survol (souris uniquement)
 * Si le visiteur a demandé « moins d'animations », rien n'est activé et tout reste visible.
 * Le contenu est toujours visible sans JavaScript : la classe .pre n'est posée que par ce script.
 */
export function initHomeMotion(): () => void {
  if (typeof window === "undefined") return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const off: Array<() => void> = [];
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // 1. Apparition progressive : seuls les blocs situés sous la ligne de flottaison sont masqués puis révélés.
  const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
  if ("IntersectionObserver" in window && items.length > 0) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.remove("pre");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    for (const el of items) {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
        el.classList.add("pre");
        io.observe(el);
      }
    }
    off.push(() => {
      io.disconnect();
      for (const el of items) el.classList.remove("pre");
    });
  }

  // 2. Parallaxe au défilement + inclinaison à la souris
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (hero) {
    let queued = false;
    const update = () => {
      queued = false;
      hero.style.setProperty("--sy", String(Math.round(Math.min(window.scrollY, 900))));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    off.push(() => window.removeEventListener("scroll", onScroll));

    if (fine) {
      const move = (e: PointerEvent) => {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty("--px", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        hero.style.setProperty("--py", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
      };
      const leave = () => {
        hero.style.setProperty("--px", "0");
        hero.style.setProperty("--py", "0");
      };
      hero.addEventListener("pointermove", move);
      hero.addEventListener("pointerleave", leave);
      off.push(() => {
        hero.removeEventListener("pointermove", move);
        hero.removeEventListener("pointerleave", leave);
      });
    }
  }

  // 3. Cartes de spectacle
  if (fine) {
    for (const card of Array.from(document.querySelectorAll<HTMLElement>(".ticket"))) {
      const move = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top) / r.height;
        card.style.setProperty("--ty", `${((nx - 0.5) * 12).toFixed(2)}deg`);
        card.style.setProperty("--tx", `${((0.5 - ny) * 10).toFixed(2)}deg`);
        card.style.setProperty("--gx", `${(nx * 100).toFixed(1)}%`);
        card.style.setProperty("--gy", `${(ny * 100).toFixed(1)}%`);
      };
      const leave = () => {
        for (const k of ["--tx", "--ty", "--gx", "--gy"]) card.style.removeProperty(k);
      };
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerleave", leave);
      off.push(() => {
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerleave", leave);
      });
    }
  }

  return () => off.forEach((fn) => fn());
}
