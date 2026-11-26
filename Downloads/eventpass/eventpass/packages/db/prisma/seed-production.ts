/**
 * Données de base pour la PRODUCTION : uniquement les catégories d'événements (aucune donnée de démonstration).
 * L'administrateur se crée ensuite avec : npm run admin:create -- vous@exemple.com "mot-de-passe-long"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  ["Concerts", "concerts"],
  ["Théâtre", "theatre"],
  ["Humour", "humour"],
  ["Sport", "sport"],
  ["Festivals", "festivals"],
  ["Famille", "famille"],
];

async function main() {
  for (const [name, slug] of categories) {
    await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }
  console.log("Catégories de base créées. Créez maintenant votre administrateur : npm run admin:create -- email mot-de-passe");
}

main().finally(() => prisma.$disconnect());
