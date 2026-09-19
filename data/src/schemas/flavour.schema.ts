import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date in YYYY-MM-DD format");

export const flavourCategorySchema = z.enum([
  "microdrink",
  "microenergy",
  "microlyte",
  "microtea",
]);

export const flavourEditionSchema = z.enum(["regular", "limited"]);

export const flavourLifecycleSchema = z.enum([
  "active",
  "discontinued",
  "unknown",
]);

export const flavourSourceSchema = z.object({
  type: z.enum(["official", "archive", "community", "manual"]),
  name: z.string().trim().min(1),
  url: z.string().url(),
});

export const flavourSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case id"),
  name: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  category: flavourCategorySchema,
  flavourNotes: z.array(z.string().trim().min(1)),
  ingredients: z.array(z.string().trim().min(1)),
  edition: flavourEditionSchema,
  lifecycle: flavourLifecycleSchema,
  caffeineMg: z.number().int().nonnegative().optional(),
  firstSeen: isoDateSchema,
  lastSeen: isoDateSchema,
  sources: z.array(flavourSourceSchema).min(1),
});

export const flavourCatalogueSchema = z.array(flavourSchema).superRefine((flavours, ctx) => {
  const ids = new Set<string>();

  for (const [index, flavour] of flavours.entries()) {
    if (ids.has(flavour.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate flavour id: ${flavour.id}`,
        path: [index, "id"],
      });
    }

    ids.add(flavour.id);
  }
});

export const waterdropRawFlavourSchema = z.object({
  handle: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: flavourCategorySchema,
  flavourNotes: z.array(z.string().trim().min(1)),
  ingredients: z.array(z.string().trim().min(1)),
  edition: flavourEditionSchema,
  caffeineMg: z.number().int().nonnegative().optional(),
  productUrl: z.string().url(),
  scrapedAt: z.string().datetime(),
});

export const waterdropSnapshotSchema = z.object({
  source: z.literal("waterdrop.nl"),
  collectionUrl: z.string().url(),
  scrapedAt: z.string().datetime(),
  flavours: z.array(waterdropRawFlavourSchema),
});

export type Flavour = z.infer<typeof flavourSchema>;
export type FlavourCategory = z.infer<typeof flavourCategorySchema>;
export type FlavourSource = z.infer<typeof flavourSourceSchema>;
export type WaterdropRawFlavour = z.infer<typeof waterdropRawFlavourSchema>;
export type WaterdropSnapshot = z.infer<typeof waterdropSnapshotSchema>;
