import { z } from 'zod';
import { citationSchema, stringArray } from './common.js';

export const conceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  strategyFit: z.string(),
  difficulty: z.string(),
  estimatedCost: z.number(),
  buildTime: z.string(),
  requiredTools: stringArray,
  requiredParts: stringArray,
  mainMechanisms: stringArray,
  pros: stringArray,
  cons: stringArray,
  risks: stringArray,
  ruleConcerns: z.array(citationSchema).optional(),
  upgradePath: stringArray,
}).strict();

export const conceptsSchema = z.object({
  concepts: z.array(conceptSchema).length(3),
}).strict();

export const conceptsPromptDescriptor = 'Return JSON exactly as { "concepts": [three concept objects with id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, ruleConcerns, upgradePath] }.';

