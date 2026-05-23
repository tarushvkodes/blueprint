import { AdapterValidationError } from './errors.js';

export function validateStructuredOutput({ adapterName, schemaName, schema, data }) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AdapterValidationError({
      adapterName,
      schemaName,
      issues: result.error.issues,
      response: data,
    });
  }
  return result.data;
}

