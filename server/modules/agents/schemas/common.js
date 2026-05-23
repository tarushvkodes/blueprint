import { z } from 'zod';

export const nullableString = z.string().nullable().optional();
export const stringArray = z.array(z.string());

export const citationSchema = z.object({
  ruleNumber: z.string().optional(),
  manualSection: z.string().optional(),
  sourceDocument: z.string().optional(),
  version: z.string().nullable().optional(),
  explanation: z.string().optional(),
  confidence: z.string().optional(),
}).strict();

