import { prisma } from "./client.js";

async function main() {
  console.log("Seeding database...");

  await prisma.creativeProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      displayName: "Your Name Photography",
      craft: "concert photography",
      services: ["Live concert photography", "Backstage/press photography", "Event coverage"],
      experienceBullets: [
        "Shot free/unpaid live music and event sets to build a concert photography portfolio",
        "Comfortable working low-light, fast-moving stage and crowd environments",
      ],
      styleKeywords: ["low-light", "high-energy", "candid", "stage lighting", "documentary"],
      targetCities: ["Bengaluru", "Mumbai", "Delhi"],
      targetGenres: ["electronic", "house", "techno", "indie", "hip-hop"],
      portfolioUrl: "https://your-portfolio-site.example.com",
    },
  });

  const discoveryQueries: Array<{ query: string; location: string; notes: string }> = [
    {
      query: "upcoming electronic and live music events in Bengaluru, India",
      location: "Bengaluru, India",
      notes: "Seed example — edit or add more queries on the Settings page",
    },
    {
      query: "upcoming concerts and music festivals in India",
      location: "India",
      notes: "Seed example — broader net across the country",
    },
  ];
  for (const dq of discoveryQueries) {
    await prisma.discoveryQuery.upsert({
      where: { query: dq.query },
      update: {},
      create: { ...dq, active: true },
    });
  }

  await prisma.portfolioReference.upsert({
    where: { id: "seed-portfolio-1" },
    update: {},
    create: {
      id: "seed-portfolio-1",
      title: "Concert & event photography portfolio",
      url: "https://your-portfolio-site.example.com",
      description: "Selected live music and event photography work.",
      tags: ["concert", "low-light", "event"],
      category: "portfolio",
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (adminEmail && adminPasswordHash) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash: adminPasswordHash },
      create: { email: adminEmail, passwordHash: adminPasswordHash },
    });
    console.log(`Admin user ready: ${adminEmail}`);
  } else {
    console.warn(
      "Skipped admin user creation — set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in .env and re-run `pnpm db:seed` to create your login.",
    );
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
