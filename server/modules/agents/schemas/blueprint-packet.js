import { z } from 'zod';
import { buildStepSchema } from './build-guide.js';
import { citationSchema, stringArray } from './common.js';
import { conceptSchema } from './concepts.js';

export const strategySchema = z.object({
  recommendation: z.string(),
  scoringPriorities: stringArray,
  whatToIgnore: stringArray,
  autonomous: stringArray,
  teleOp: stringArray,
  endgame: stringArray,
  driverPracticeGoals: stringArray,
  allianceCompatibility: z.string(),
  citations: z.array(citationSchema).optional(),
}).strict();

export const blueprintPacketSchema = z.object({
  strategy: strategySchema,
  concepts: z.array(conceptSchema).length(3),
  buildGuide: z.array(buildStepSchema).min(1),
  chatSeed: z.string().optional(),
}).strict();

export const blueprintPacketPromptDescriptor = 'Return JSON exactly as { "strategy": { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility, citations }, "concepts": three Concepts, "buildGuide": BuildGuide steps, "chatSeed": string }.';

