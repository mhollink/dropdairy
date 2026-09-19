import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { mergeFlavours } from "../merge/merge-flavours";
import { normalizeWaterdropFlavour } from "../normalize/normalize-flavour";
import {
  type Flavour,
  type WaterdropSnapshot,
  waterdropSnapshotSchema,
} from "../schemas/flavour.schema";
import { validateCatalogue } from "../validate/validate-catalogue";

export async function loadWaterdropSnapshots(
  rawDirectory: string,
): Promise<WaterdropSnapshot[]> {
  const files = (await readdir(rawDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error(`No Waterdrop snapshots found in ${rawDirectory}`);
  }

  const snapshots = await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(join(rawDirectory, file), "utf8");
      return waterdropSnapshotSchema.parse(JSON.parse(contents));
    }),
  );

  return snapshots.sort((left, right) =>
    left.scrapedAt.localeCompare(right.scrapedAt),
  );
}

export function buildCatalogue(snapshots: readonly WaterdropSnapshot[]): Flavour[] {
  const latestSnapshot = snapshots.at(-1);
  if (!latestSnapshot) {
    throw new Error("Cannot build a catalogue without at least one snapshot");
  }

  const observations = snapshots.flatMap((snapshot) =>
    snapshot.flavours.map(normalizeWaterdropFlavour),
  );
  const currentFlavourIds = new Set(
    latestSnapshot.flavours.map((flavour) =>
      normalizeWaterdropFlavour(flavour).id,
    ),
  );

  return validateCatalogue(mergeFlavours(observations, currentFlavourIds));
}

export async function generateCatalogue(
  rawDirectory: string,
  outputFile: string,
): Promise<Flavour[]> {
  const snapshots = await loadWaterdropSnapshots(rawDirectory);
  const catalogue = buildCatalogue(snapshots);

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");

  return catalogue;
}
