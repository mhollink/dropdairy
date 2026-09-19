import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateCatalogue,
  loadWaterdropSnapshots,
} from "./generate/generate-catalogue";
import { normalizeWaterdropFlavour } from "./normalize/normalize-flavour";
import { waterdropSnapshotSchema } from "./schemas/flavour.schema";
import { scrapeWaterdropFlavours } from "./sources/waterdrop";
import { validateCatalogue } from "./validate/validate-catalogue";

const dataRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = resolve(dataRoot, "..");
const waterdropRawDirectory = join(
  dataRoot,
  "raw",
  "official",
  "waterdrop-nl",
);
const generatedCatalogueFile = join(
  repositoryRoot,
  "packages",
  "catalogue",
  "generated",
  "flavours.json",
);

const snapshotFileName = (scrapedAt: string): string =>
  `${scrapedAt.slice(0, 10)}.json`;

async function writeWaterdropSnapshot(): Promise<string> {
  const snapshot = waterdropSnapshotSchema.parse(await scrapeWaterdropFlavours());
  const outputFile = join(
    waterdropRawDirectory,
    snapshotFileName(snapshot.scrapedAt),
  );

  await mkdir(waterdropRawDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(`Scraped ${snapshot.flavours.length} flavours to ${outputFile}`);
  return outputFile;
}

async function normalizeLatestSnapshot(): Promise<void> {
  const snapshots = await loadWaterdropSnapshots(waterdropRawDirectory);
  const latestSnapshot = snapshots.at(-1);

  if (!latestSnapshot) {
    throw new Error("No Waterdrop snapshot available to normalize");
  }

  const flavours = validateCatalogue(
    latestSnapshot.flavours.map(normalizeWaterdropFlavour),
  );

  console.log(
    `Normalized ${flavours.length} flavours from ${latestSnapshot.scrapedAt.slice(0, 10)}`,
  );
}

async function validateGeneratedCatalogue(): Promise<void> {
  const contents = await readFile(generatedCatalogueFile, "utf8");
  const catalogue = validateCatalogue(JSON.parse(contents));
  console.log(`Validated ${catalogue.length} generated flavours`);
}

async function generate(): Promise<void> {
  const catalogue = await generateCatalogue(
    waterdropRawDirectory,
    generatedCatalogueFile,
  );
  console.log(
    `Generated ${catalogue.length} flavours in ${generatedCatalogueFile}`,
  );
}

async function update(): Promise<void> {
  await writeWaterdropSnapshot();
  await generate();
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case "scrape":
      await writeWaterdropSnapshot();
      return;
    case "normalize":
      await normalizeLatestSnapshot();
      return;
    case "validate":
      await validateGeneratedCatalogue();
      return;
    case "generate":
      await generate();
      return;
    case "update":
      await update();
      return;
    default: {
      const availableCommands = [
        "scrape",
        "normalize",
        "validate",
        "generate",
        "update",
      ];
      throw new Error(
        `Unknown or missing command. Use one of: ${availableCommands.join(", ")}`,
      );
    }
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
