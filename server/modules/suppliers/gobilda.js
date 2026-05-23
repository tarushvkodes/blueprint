import { NotImplementedError, SupplierAdapter } from './adapter.js';

export class GoBildaSupplierAdapter extends SupplierAdapter {
  constructor() {
    super({ supplier: 'gobilda' });
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

export function createGoBildaSupplierAdapter() {
  return new GoBildaSupplierAdapter();
}
