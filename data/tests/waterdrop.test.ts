import { describe, expect, it } from "vitest";

import {
  categoryFromWaterdropHandle,
  parseWaterdropProductPage,
} from "../src/sources/waterdrop";

const scrapedAt = "2026-09-19T19:00:00.000Z";

describe("categoryFromWaterdropHandle", () => {
  it.each([
    ["microdrink-cola", "microdrink"],
    ["microenergy-cherry-boost", "microenergy"],
    ["microlyte-orange-recharge", "microlyte"],
    ["ice-tea-peach", "microtea"],
    ["ricola-drink-cubes-raspberry-melissa", "microdrink"],
  ] as const)("maps %s to %s", (handle, category) => {
    expect(categoryFromWaterdropHandle(handle)).toBe(category);
  });
});

describe("parseWaterdropProductPage", () => {
  it("extracts an individual flavour", () => {
    const html = `
      <main>
        <section>
          <div>LIMITED EDITION</div>
          <h1>CHERRY BOOST</h1>
          <p>12 drankjes · 90 mg cafeïne</p>
          <h2>Ingrediënten & voedingswaarden</h2>
          <p>
            Ingrediënten: voedingszuur: citroenzuur; natuurlijk aroma;
            cafeïne, kruidenextract (munt, melisse), vitamine C
          </p>
          <p>24 g (12 porties van 2 g)</p>
          <h2>Hoe klaar te maken</h2>
        </section>
      </main>
    `;

    expect(
      parseWaterdropProductPage(
        html,
        "https://www.waterdrop.nl/products/microenergy-cherry-boost?variant=1",
        { scrapedAt },
      ),
    ).toEqual({
      handle: "microenergy-cherry-boost",
      name: "CHERRY BOOST",
      category: "microenergy",
      flavourNotes: [],
      ingredients: [
        "voedingszuur: citroenzuur",
        "natuurlijk aroma",
        "cafeïne",
        "kruidenextract (munt, melisse)",
        "vitamine C",
      ],
      edition: "limited",
      caffeineMg: 90,
      productUrl:
        "https://www.waterdrop.nl/products/microenergy-cherry-boost",
      scrapedAt,
    });
  });

  it("finds the product heading after overlay headings and duplicate names", () => {
    const html = `
      <body>
        <main>
          <aside>
            <h1>Zoeken</h1>
            <h1>Winkelwagen</h1>
            <a>COLA</a>
            <span>Normale prijs €8,99</span>
          </aside>
          <section>
            <h1>COLA</h1>
            <p>12 drankjes · Met vitaminen, suikervrij</p>
            <h2>Ingrediënten & voedingswaarden</h2>
            <p>Ingrediënten: natuurlijk aroma, vitamine C</p>
            <p>25,2 g (12 porties van 2,1 g)</p>
          </section>
        </main>
      </body>
    `;

    expect(
      parseWaterdropProductPage(
        html,
        "https://www.waterdrop.nl/products/microdrink-cola",
        { scrapedAt },
      ),
    ).toMatchObject({
      handle: "microdrink-cola",
      name: "COLA",
      category: "microdrink",
    });
  });

  it("ignores multi-flavour sets", () => {
    const html = `
      <main>
        <h1>Microdrink Klassieker Set</h1>
        <p>48 drankjes · Met vitamines</p>
      </main>
    `;

    expect(
      parseWaterdropProductPage(
        html,
        "https://www.waterdrop.nl/products/microdrink-bestseller-set",
        { scrapedAt },
      ),
    ).toBeNull();
  });
});
