import { z } from 'zod';
import { stringArray } from './common.js';

export const buildStepSchema = z.object({
  phase: z.string(),
  title: z.string(),
  parts: stringArray,
  tools: stringArray,
  time: z.string(),
  diagram: z.string(),
  instructions: z.string(),
  checkpoint: z.string(),
  commonMistake: z.string(),
  test: z.string(),
  generatedBy: z.string().optional(),
}).strict();

export const buildGuideSchema = z.object({
  buildSteps: z.array(buildStepSchema).min(1),
}).strict();

export const buildGuidePromptDescriptor = 'Return JSON exactly as { "buildSteps": [{ "phase": string, "title": string, "parts": string[], "tools": string[], "time": string, "diagram": string, "instructions": string, "checkpoint": string, "commonMistake": string, "test": string }] }.';

