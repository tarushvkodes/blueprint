import { z } from 'zod';
import { nullableString } from './common.js';

export const bomLineSchema = z.object({
  subsystem: z.string(),
  query: z.string().optional(),
  qty: z.number(),
  required: z.boolean().optional(),
  buyFirst: z.number().optional(),
  supplier: z.string().optional(),
  sku: z.string(),
  part: z.string(),
  price: z.number(),
  total: z.number(),
  productUrl: nullableString,
  cadUrl: nullableString,
  stock: z.string(),
  lastChecked: nullableString,
  inInventory: z.boolean().optional(),
  substitutionSuggestions: z.array(z.string()).optional(),
}).strict();

export const bomSchema = z.object({
  conceptId: z.string().optional(),
  required: z.array(bomLineSchema),
  optional: z.array(bomLineSchema),
  spareParts: z.array(bomLineSchema),
  alreadyOwned: z.array(bomLineSchema),
  missing: z.array(bomLineSchema),
  subtotal: z.number(),
  shippingEstimatePlaceholder: z.number().optional(),
  budgetRemaining: z.number(),
  buyFirst: z.array(bomLineSchema),
  budgetMode: z.string().optional(),
  substitutions: z.array(z.string()).optional(),
}).strict();

export const bomPromptDescriptor = 'Return JSON exactly as { "conceptId": string, "required": BomLine[], "optional": BomLine[], "spareParts": BomLine[], "alreadyOwned": BomLine[], "missing": BomLine[], "subtotal": number, "shippingEstimatePlaceholder": number, "budgetRemaining": number, "buyFirst": BomLine[], "budgetMode": string, "substitutions": string[] }.';

