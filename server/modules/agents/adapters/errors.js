export class AdapterValidationError extends Error {
  constructor({ adapterName, schemaName, issues, response }) {
    super(`Adapter response failed ${schemaName || 'structured'} validation.`);
    this.name = 'AdapterValidationError';
    this.adapterName = adapterName;
    this.schemaName = schemaName;
    this.issues = issues;
    this.response = response;
  }
}

