import { z } from 'zod';

export const chatSchema = z.object({
  answer: z.string(),
  suggestedActions: z.array(z.string()),
}).strict();

export const chatPromptDescriptor = 'Return JSON exactly as { "answer": string, "suggestedActions": string[] }.';

