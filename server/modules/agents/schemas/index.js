import { blueprintPacketPromptDescriptor, blueprintPacketSchema } from './blueprint-packet.js';
import { bomPromptDescriptor, bomSchema } from './bom.js';
import { buildGuidePromptDescriptor, buildGuideSchema } from './build-guide.js';
import { chatPromptDescriptor, chatSchema } from './chat.js';
import { codePromptDescriptor, codeSchema } from './code.js';
import { conceptsPromptDescriptor, conceptsSchema } from './concepts.js';
import { physicsPromptDescriptor, physicsSchema } from './physics.js';
import { reviewPromptDescriptor, reviewVerdictSchema } from './review.js';

export {
  blueprintPacketSchema,
  bomSchema,
  buildGuideSchema,
  chatSchema,
  codeSchema,
  conceptsSchema,
  physicsSchema,
  reviewVerdictSchema,
};

export const schemaRegistry = {
  BlueprintPacket: {
    name: 'BlueprintPacket',
    schema: blueprintPacketSchema,
    promptDescriptor: blueprintPacketPromptDescriptor,
  },
  Concepts: {
    name: 'Concepts',
    schema: conceptsSchema,
    promptDescriptor: conceptsPromptDescriptor,
  },
  Bom: {
    name: 'Bom',
    schema: bomSchema,
    promptDescriptor: bomPromptDescriptor,
  },
  Physics: {
    name: 'Physics',
    schema: physicsSchema,
    promptDescriptor: physicsPromptDescriptor,
  },
  BuildGuide: {
    name: 'BuildGuide',
    schema: buildGuideSchema,
    promptDescriptor: buildGuidePromptDescriptor,
  },
  Code: {
    name: 'Code',
    schema: codeSchema,
    promptDescriptor: codePromptDescriptor,
  },
  Chat: {
    name: 'Chat',
    schema: chatSchema,
    promptDescriptor: chatPromptDescriptor,
  },
  ReviewVerdict: {
    name: 'ReviewVerdict',
    schema: reviewVerdictSchema,
    promptDescriptor: reviewPromptDescriptor,
  },
};

export function getSchemaEntry(schemaName) {
  return schemaRegistry[schemaName] || null;
}

export function schemaPrompt(schemaName) {
  return getSchemaEntry(schemaName)?.promptDescriptor || 'Return only valid JSON that matches the requested schema.';
}

