import { NotImplementedError, SupplierAdapter } from './adapter.js';

export class AndyMarkSupplierAdapter extends SupplierAdapter {
  constructor() {
    super({ supplier: 'andymark' });
  }

  async searchProducts() {
    throw new NotImplementedError(this.supplier, 'searchProducts');
  }

  async getProduct() {
    throw new NotImplementedError(this.supplier, 'getProduct');
  }

  async getCadUrl() {
    throw new NotImplementedError(this.supplier, 'getCadUrl');
  }

  async discover() {
    throw new NotImplementedError(this.supplier, 'discover');
  }
}

export function createAndyMarkSupplierAdapter() {
  return new AndyMarkSupplierAdapter();
}
