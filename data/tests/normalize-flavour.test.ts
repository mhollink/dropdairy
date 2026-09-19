import { describe, expect, it } from "vitest";

import {
  normalizeWaterdropFlavour,
  stableFlavourId,
} from "../src/normalize/normalize-flavour";
import type { WaterdropRawFlavour } from "../src/schemas/flavour.schema";

const rawFlavour: WaterdropRawFlavour = {
  handle: "microdrink-cola",
  name: "COLA",
  category: "microdrink",
  flavourNotes: [],
  ingredients: ["natuurlijk aroma"],
  edition: "regular",
  productUrl: "https://www.waterdrop.nl/products/microdrink-cola",
  scrapedAt: "2026-09-19T19:00:00.000Z",
};

describe("stableFlavourId", () => {
  it("keeps Waterdrop handles that already contain the category", () => {
    expect(stableFlavourId(rawFlavour)).toBe("microdrink-cola");
  });

  it("prefixes handles that do not contain the catalogue category", () => {
    expect(
      stableFlavourId({
        ...rawFlavour,
        handle: "ice-tea-peach",
        name: "ICE TEA PERZIK",
        category: "microtea",
      }),
    ).toBe("microtea-ice-tea-peach");
  });
});

describe("normalizeWaterdropFlavour", () => {
  it("creates an active catalogue flavour with official provenance", () => {
    expect(normalizeWaterdropFlavour(rawFlavour)).toEqual({
      id: "microdrink-cola",
      name: "COLA",
      aliases: [],
      category: "microdrink",
      flavourNotes: [],
      ingredients: ["natuurlijk aroma"],
      edition: "regular",
      lifecycle: "active",
      firstSeen: "2026-09-19",
      lastSeen: "2026-09-19",
      sources: [
        {
          type: "official",
          name: "waterdrop.nl",
          url: "https://www.waterdrop.nl/products/microdrink-cola",
        },
      ],
    });
  });
});
