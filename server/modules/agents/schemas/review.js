import { z } from 'zod';

export const reviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'warning', 'info']),
  artifact: z.string().optional(),
  message: z.string(),
  recommendation: z.string().optional(),
}).strict();

export const reviewVerdictSchema = z.object({
  issues: z.array(reviewIssueSchema),
  passed: z.boolean(),
  score: z.number().min(0).max(100),
}).strict();

export const reviewPromptDescriptor = 'Return JSON exactly as { "issues": [{ "severity": "blocker"|"warning"|"info", "artifact": string, "message": string, "recommendation": string }], "passed": boolean, "score": number 0-100 }.';

