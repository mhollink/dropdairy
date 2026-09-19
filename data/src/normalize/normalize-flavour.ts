import type {
  Flavour,
  WaterdropRawFlavour,
} from "../schemas/flavour.schema";

const unique = (values: readonly string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export function stableFlavourId(raw: WaterdropRawFlavour): string {
  if (raw.handle.startsWith(`${raw.category}-`)) {
    return raw.handle;
  }

  return `${raw.category}-${raw.handle}`;
}

export function normalizeWaterdropFlavour(raw: WaterdropRawFlavour): Flavour {
  const observedDate = raw.scrapedAt.slice(0, 10);

  return {
    id: stableFlavourId(raw),
    name: raw.name,
    aliases: [],
    category: raw.category,
    flavourNotes: unique(raw.flavourNotes),
    ingredients: unique(raw.ingredients),
    edition: raw.edition,
    lifecycle: "active",
    ...(raw.caffeineMg === undefined ? {} : { caffeineMg: raw.caffeineMg }),
    firstSeen: observedDate,
    lastSeen: observedDate,
    sources: [
      {
        type: "official",
        name: "waterdrop.nl",
        url: raw.productUrl,
      },
    ],
  };
}
