import type { Flavour, FlavourSource } from "../schemas/flavour.schema";

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values),
].sort((left, right) => left.localeCompare(right, "nl"));

const sourceKey = (source: FlavourSource): string =>
  `${source.type}\u0000${source.name}\u0000${source.url}`;

const mergeSources = (
  left: readonly FlavourSource[],
  right: readonly FlavourSource[],
): FlavourSource[] => {
  const sources = new Map<string, FlavourSource>();

  for (const source of [...left, ...right]) {
    sources.set(sourceKey(source), source);
  }

  return [...sources.values()];
};

function mergeObservation(existing: Flavour, observation: Flavour): Flavour {
  const observationIsNewer = observation.lastSeen >= existing.lastSeen;
  const latest = observationIsNewer ? observation : existing;
  const earlier = observationIsNewer ? existing : observation;

  return {
    ...latest,
    aliases: uniqueStrings([...existing.aliases, ...observation.aliases]),
    flavourNotes:
      latest.flavourNotes.length > 0
        ? latest.flavourNotes
        : earlier.flavourNotes,
    ingredients:
      latest.ingredients.length > 0 ? latest.ingredients : earlier.ingredients,
    ...(latest.caffeineMg === undefined && earlier.caffeineMg !== undefined
      ? { caffeineMg: earlier.caffeineMg }
      : {}),
    firstSeen:
      existing.firstSeen < observation.firstSeen
        ? existing.firstSeen
        : observation.firstSeen,
    lastSeen:
      existing.lastSeen > observation.lastSeen
        ? existing.lastSeen
        : observation.lastSeen,
    sources: mergeSources(existing.sources, observation.sources),
  };
}

export function mergeFlavours(
  observations: readonly Flavour[],
  currentFlavourIds: ReadonlySet<string>,
): Flavour[] {
  const merged = new Map<string, Flavour>();

  for (const observation of observations) {
    const existing = merged.get(observation.id);
    merged.set(
      observation.id,
      existing ? mergeObservation(existing, observation) : observation,
    );
  }

  return [...merged.values()]
    .map((flavour) => ({
      ...flavour,
      lifecycle: currentFlavourIds.has(flavour.id)
        ? flavour.lifecycle
        : "unknown",
    }))
    .sort((left, right) => {
      const categoryOrder = left.category.localeCompare(right.category);
      return categoryOrder !== 0
        ? categoryOrder
        : left.name.localeCompare(right.name, "nl");
    });
}
