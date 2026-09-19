import {
  flavourCatalogueSchema,
  type Flavour,
} from "../schemas/flavour.schema";

export function validateCatalogue(value: unknown): Flavour[] {
  const result = flavourCatalogueSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "catalogue";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid flavour catalogue:\n${issues}`);
}
