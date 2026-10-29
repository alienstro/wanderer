// Fills a local database with sample characters, so that Discover is not empty in development.
// It uses no images: the prototype images stay in the prototype (spec section 13).
// Run it with: pnpm --filter @wanderer/api seed:dev
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

try {
  process.loadEnvFile();
} catch {
  // No .env file. The environment has the values.
}

const databaseUrl = process.env.DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(databaseUrl).hostname;
} catch {
  // The check below stops the script.
}
if (!LOCAL_HOSTS.has(host)) {
  console.error(`seed:dev runs only against a local database. DATABASE_URL points to "${host || "nothing"}".`);
  process.exit(1);
}

interface SampleCharacter {
  title: string;
  chatName?: string;
  bio: string;
  personality: string;
  scenario: string;
  openings: string[];
  tags: string[];
  chatCount: number;
}

const SAMPLES: SampleCharacter[] = [
  {
    title: "Captain Ilse Varga",
    chatName: "Ilse",
    bio: "The captain of a **salvage ship** at the edge of the known lanes.",
    personality: "Dry humor, fast decisions, and a strong loyalty to her crew.",
    scenario: "The ship drifts near a dead station that still sends a signal.",
    openings: ["*Ilse taps the console.* \"That signal is twenty years old. Who wants to go look?\""],
    tags: ["sci-fi", "adventure"],
    chatCount: 412,
  },
  {
    title: "Detective Ruo Han",
    chatName: "Ruo",
    bio: "A tired detective in a city where it rains every night.",
    personality: "Quiet, careful, and honest even when honesty costs him.",
    scenario: "A client comes into his office at midnight with a wet envelope.",
    openings: ["*He does not look up from the file.* \"Sit down. Tell me what you saw.\""],
    tags: ["noir", "mystery"],
    chatCount: 268,
  },
  {
    title: "Thessaly of the Ash Wood",
    chatName: "Thessaly",
    bio: "A forest witch who trades in true names.",
    personality: "Calm, curious, and a little cruel to people who lie.",
    scenario: "The traveler is lost in the Ash Wood after dark.",
    openings: ["*A lantern swings between the trees.* \"You are far from the road, little one.\""],
    tags: ["fantasy"],
    chatCount: 197,
  },
  {
    title: "Sergeant Okafor",
    chatName: "Okafor",
    bio: "The last sergeant of a broken unit, holding a bridge.",
    personality: "Steady, protective, and short with words.",
    scenario: "Night falls on the bridge, and the radio is silent.",
    openings: ["*Okafor checks the line again.* \"Stay low. They come at dawn.\""],
    tags: ["military"],
    chatCount: 88,
  },
  {
    title: "Pip and the Lighthouse",
    chatName: "Pip",
    bio: "A cheerful lighthouse keeper on a small island.",
    personality: "Warm, talkative, and fond of tea and old stories.",
    scenario: "A storm ends, and a boat washes up on the beach.",
    openings: ["*Pip runs down the steps.* \"Are you hurt? Come in, the kettle is on!\""],
    tags: ["slice-of-life"],
    chatCount: 54,
  },
  {
    title: "The Quiet Hallway",
    bio: "A school after hours, where one door should not be open.",
    personality: "The narrator is calm and precise, and the dread grows slowly.",
    scenario: "The user stayed late to finish a project.",
    openings: ["The lights in the east hallway turn off, one by one."],
    tags: ["horror", "school"],
    chatCount: 143,
  },
  {
    title: "Wasteland Courier Juno",
    chatName: "Juno",
    bio: "A courier who carries letters across the ruined plains.",
    personality: "Bold, funny, and a bit reckless.",
    scenario: "The user hires Juno to carry a package that ticks.",
    openings: ["*Juno shakes the box.* \"So... what is in it? I do not judge. Much.\""],
    tags: ["post-apoc", "adventure"],
    chatCount: 31,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const creator = await prisma.user.upsert({
      where: { email: "wanderer_dev@example.com" },
      update: {},
      create: { email: "wanderer_dev@example.com", googleSub: "dev-seed-user", name: "Wanderer Dev", handle: "wanderer_dev" },
    });
    // The seed starts again each time, so it gives the same 8 characters after each run.
    await prisma.character.deleteMany({ where: { creatorId: creator.id } });
    for (const [index, sample] of SAMPLES.entries()) {
      await prisma.character.create({
        data: {
          creatorId: creator.id,
          title: sample.title,
          chatName: sample.chatName ?? "",
          bio: sample.bio,
          personality: sample.personality,
          scenario: sample.scenario,
          status: "published",
          chatCount: sample.chatCount,
          createdAt: new Date(Date.now() - index * 3_600_000),
          openings: { create: sample.openings.map((text, position) => ({ position, text })) },
          tags: { create: sample.tags.map((tagSlug) => ({ tagSlug })) },
        },
      });
    }
    console.log(`seed:dev made ${SAMPLES.length} characters for @${creator.handle ?? ""}.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
