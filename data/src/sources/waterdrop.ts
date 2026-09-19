import * as cheerio from "cheerio";

import type {
  FlavourCategory,
  WaterdropRawFlavour,
  WaterdropSnapshot,
} from "../schemas/flavour.schema";

export const WATERDROP_COLLECTION_URL =
  "https://www.waterdrop.nl/collections/all-flavours";

const WATERDROP_ORIGIN = new URL(WATERDROP_COLLECTION_URL).origin;
const MAX_COLLECTION_PAGES = 10;
const PRODUCT_CONCURRENCY = 4;
const MIN_EXPECTED_FLAVOURS = 10;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

interface ProductCandidate {
  handle: string;
  url: string;
  limitedEditionHint: boolean;
}

interface ParseProductOptions {
  scrapedAt: string;
  limitedEditionHint?: boolean;
}

const normalizeWhitespace = (value: string): string =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const unique = (values: readonly string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export function categoryFromWaterdropHandle(
  handle: string,
): FlavourCategory | null {
  if (handle.startsWith("microdrink-")) {
    return "microdrink";
  }

  if (handle.startsWith("microenergy-")) {
    return "microenergy";
  }

  if (handle.startsWith("microlyte-")) {
    return "microlyte";
  }

  if (handle.startsWith("ice-tea-")) {
    return "microtea";
  }

  if (handle.startsWith("ricola-drink-cubes-")) {
    return "microdrink";
  }

  return null;
}

function productHandleFromUrl(productUrl: string): string | null {
  const { pathname } = new URL(productUrl, WATERDROP_ORIGIN);
  const match = pathname.match(/^\/products\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function canonicalProductUrl(href: string): string | null {
  const url = new URL(href, WATERDROP_ORIGIN);

  if (url.origin !== WATERDROP_ORIGIN) {
    return null;
  }

  const handle = productHandleFromUrl(url.toString());
  if (!handle || !categoryFromWaterdropHandle(handle)) {
    return null;
  }

  return new URL(`/products/${handle}`, WATERDROP_ORIGIN).toString();
}

function extractCandidatesFromCollectionPage(html: string): ProductCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, ProductCandidate>();

  const addCandidate = (href: string, limitedEditionHint = false): void => {
    const url = canonicalProductUrl(href);
    if (!url) {
      return;
    }

    const handle = productHandleFromUrl(url);
    if (!handle) {
      return;
    }

    const existing = candidates.get(handle);
    candidates.set(handle, {
      handle,
      url,
      limitedEditionHint:
        limitedEditionHint || existing?.limitedEditionHint === true,
    });
  };

  // Prefer semantic product links when Shopify renders the collection normally.
  $("a[href*='/products/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const context = normalizeWhitespace(
      $(element).closest("li, article").first().text(),
    );
    addCandidate(href, /\blimited edition\b/i.test(context));
  });

  // Shopify regularly changes collection-card markup. Product URLs are also
  // embedded in JSON/script data, so use them as a markup-independent fallback.
  for (const match of html.matchAll(
    /(?:https?:\/\/www\.waterdrop\.nl)?\/products\/([a-z0-9-]+)/gi,
  )) {
    const handle = match[1];
    if (handle) {
      addCandidate(`/products/${handle}`);
    }
  }

  return [...candidates.values()];
}

interface ProductLead {
  name: string;
  text: string;
}

function extractProductLead(
  scopeText: string,
  headingNames: readonly string[],
): ProductLead | null {
  const normalizedScopeText = scopeText.toLocaleLowerCase("nl");

  for (const name of unique(headingNames)) {
    const normalizedName = name.toLocaleLowerCase("nl");
    let searchFrom = 0;

    while (searchFrom < normalizedScopeText.length) {
      const nameIndex = normalizedScopeText.indexOf(normalizedName, searchFrom);
      if (nameIndex < 0) {
        break;
      }

      // Waterdrop renders search/cart overlays and recommendation cards before
      // the actual product content. Look at every occurrence of a heading and
      // select the one whose nearby text identifies an individual 12-drink pack.
      const text = scopeText.slice(
        Math.max(0, nameIndex - 200),
        nameIndex + name.length + 500,
      );

      if (extractServings(text) === 12) {
        return { name, text };
      }

      searchFrom = nameIndex + normalizedName.length;
    }
  }

  return null;
}

function extractServings(productLeadText: string): number | null {
  const match = productLeadText.match(/\b(\d+)\s+(?:drankjes|porties)\b/i);
  if (!match?.[1]) {
    return null;
  }

  const servings = Number.parseInt(match[1], 10);
  return Number.isNaN(servings) ? null : servings;
}

function extractCaffeineMg(productLeadText: string): number | undefined {
  const match = productLeadText.match(/\b(\d+)\s*mg\s*cafe[iï]ne\b/i);
  if (!match?.[1]) {
    return undefined;
  }

  const caffeineMg = Number.parseInt(match[1], 10);
  return Number.isNaN(caffeineMg) ? undefined : caffeineMg;
}

function extractIngredients(scopeText: string): string[] {
  const match = scopeText.match(
    /Ingredi[eë]nten:\s*(.+?)(?=\s+\d+(?:[.,]\d+)?\s*g\s*\(|\s+Hoe klaar te maken\b|\s+Bereid je\b)/i,
  );

  const ingredientText = match?.[1];
  if (!ingredientText) {
    return [];
  }

  return unique(splitIngredientList(ingredientText));
}

function splitIngredientList(value: string): string[] {
  const ingredients: string[] = [];
  let current = "";
  let parenthesesDepth = 0;

  const pushCurrent = (): void => {
    const ingredient = normalizeWhitespace(current);
    if (ingredient) {
      ingredients.push(ingredient);
    }
    current = "";
  };

  for (const character of value) {
    if (character === "(") {
      parenthesesDepth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      parenthesesDepth = Math.max(0, parenthesesDepth - 1);
      current += character;
      continue;
    }

    if ((character === "," || character === ";") && parenthesesDepth === 0) {
      pushCurrent();
      continue;
    }

    current += character;
  }

  pushCurrent();
  return ingredients;
}

function looksLikeLimitedEdition(
  productLeadText: string,
  limitedEditionHint: boolean,
): boolean {
  return limitedEditionHint || /\blimited edition\b/i.test(productLeadText);
}

export function parseWaterdropProductPage(
  html: string,
  productUrl: string,
  options: ParseProductOptions,
): WaterdropRawFlavour | null {
  const handle = productHandleFromUrl(productUrl);
  if (!handle) {
    return null;
  }

  const category = categoryFromWaterdropHandle(handle);
  if (!category) {
    return null;
  }

  const $ = cheerio.load(html);
  const scope = $("body");
  const scopeText = normalizeWhitespace(scope.text());
  const headingNames = scope
    .find("h1")
    .toArray()
    .map((heading) => normalizeWhitespace($(heading).text()))
    .filter(Boolean);
  const productLead = extractProductLead(scopeText, headingNames);

  // The current catalogue contains sets and bundles alongside individual flavours.
  // Individual flavour products are sold as 12-drink packs, so this also keeps
  // bundles out without relying on whichever heading happens to appear first.
  if (!productLead) {
    return null;
  }

  const { name, text: productLeadText } = productLead;
  const caffeineMg = extractCaffeineMg(productLeadText);

  return {
    handle,
    name,
    category,
    flavourNotes: [],
    ingredients: extractIngredients(scopeText),
    edition: looksLikeLimitedEdition(
      productLeadText,
      options.limitedEditionHint ?? false,
    )
      ? "limited"
      : "regular",
    ...(caffeineMg === undefined ? {} : { caffeineMg }),
    productUrl: new URL(`/products/${handle}`, WATERDROP_ORIGIN).toString(),
    scrapedAt: options.scrapedAt,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      "User-Agent": BROWSER_USER_AGENT,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  if (/cf-chl-|<title>\s*Just a moment/i.test(html)) {
    throw new Error(
      `Waterdrop returned a bot-protection page for ${url} instead of catalogue HTML`,
    );
  }

  return html;
}

async function discoverProductCandidates(): Promise<ProductCandidate[]> {
  const candidates = new Map<string, ProductCandidate>();

  for (let page = 1; page <= MAX_COLLECTION_PAGES; page += 1) {
    const pageUrl = new URL(WATERDROP_COLLECTION_URL);
    if (page > 1) {
      pageUrl.searchParams.set("page", String(page));
    }

    const html = await fetchHtml(pageUrl.toString());
    const pageCandidates = extractCandidatesFromCollectionPage(html);
    let added = 0;

    for (const candidate of pageCandidates) {
      const existing = candidates.get(candidate.handle);

      if (!existing) {
        candidates.set(candidate.handle, candidate);
        added += 1;
        continue;
      }

      if (candidate.limitedEditionHint && !existing.limitedEditionHint) {
        candidates.set(candidate.handle, {
          ...existing,
          limitedEditionHint: true,
        });
      }
    }

    if (page > 1 && added === 0) {
      break;
    }
  }

  return [...candidates.values()].sort((left, right) =>
    left.handle.localeCompare(right.handle),
  );
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const value = values[currentIndex];
      if (value === undefined) {
        continue;
      }

      results[currentIndex] = await mapper(value);
    }
  };

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export async function scrapeWaterdropFlavours(): Promise<WaterdropSnapshot> {
  const scrapedAt = new Date().toISOString();
  const candidates = await discoverProductCandidates();

  if (candidates.length === 0) {
    throw new Error(
      "Waterdrop product discovery returned 0 candidates. " +
        "The collection response did not contain any recognised product URLs.",
    );
  }

  console.log(`Discovered ${candidates.length} Waterdrop product candidates`);

  const parsed = await mapWithConcurrency(
    candidates,
    PRODUCT_CONCURRENCY,
    async (candidate) => {
      const html = await fetchHtml(candidate.url);
      return parseWaterdropProductPage(html, candidate.url, {
        scrapedAt,
        limitedEditionHint: candidate.limitedEditionHint,
      });
    },
  );

  const flavours = parsed
    .filter((flavour): flavour is WaterdropRawFlavour => flavour !== null)
    .sort((left, right) => left.name.localeCompare(right.name, "nl"));

  console.log(`Parsed ${flavours.length} Waterdrop flavours`);

  if (flavours.length < MIN_EXPECTED_FLAVOURS) {
    throw new Error(
      `Waterdrop scrape returned only ${flavours.length} flavours. ` +
        "The source markup may have changed; refusing to persist a partial snapshot.",
    );
  }

  return {
    source: "waterdrop.nl",
    collectionUrl: WATERDROP_COLLECTION_URL,
    scrapedAt,
    flavours,
  };
}
