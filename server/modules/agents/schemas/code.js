import { z } from 'zod';

export const codeFileSchema = z.object({
  fileName: z.string(),
  language: z.string(),
  content: z.string(),
}).strict();

export const codeSchema = z.object({
  files: z.array(codeFileSchema).min(1),
  hardwareConfigurationChecklist: z.array(z.string()),
}).strict();

export const codePromptDescriptor = 'Return JSON exactly as { "files": [{ "fileName": string, "language": string, "content": string }], "hardwareConfigurationChecklist": string[] }.';

