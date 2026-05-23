import { z } from 'zod';

export const physicsCalculationSchema = z.object({
  mechanism: z.string(),
  assumptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  formula: z.string(),
  calculation: z.string(),
  result: z.string(),
  safetyFactor: z.union([z.string(), z.number()]),
  recommendation: z.string(),
  warning: z.string().nullable().optional(),
}).strict();

export const physicsSchema = z.object({
  calculations: z.array(physicsCalculationSchema).min(1),
}).strict();

export const physicsPromptDescriptor = 'Return JSON exactly as { "calculations": [{ "mechanism": string, "assumptions": object, "formula": string, "calculation": string, "result": string, "safetyFactor": string|number, "recommendation": string, "warning": string|null }] }.';

