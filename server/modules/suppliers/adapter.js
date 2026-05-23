export class NotImplementedError extends Error {
  constructor(supplier, methodName) {
    super(`${supplier} adapter does not implement ${methodName}`);
    this.name = 'NotImplementedError';
  }
}

export class SupplierAdapter {
  constructor({ supplier }) {
    if (!supplier) {
      throw new Error('SupplierAdapter requires a supplier name');
    }
    this.supplier = String(supplier).toLowerCase();
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

export function assertSupplierAdapter(adapter, supplier) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Missing supplier adapter for ${supplier}`);
  }
  const requiredMethods = ['searchProducts', 'getProduct', 'getCadUrl', 'discover'];
  for (const methodName of requiredMethods) {
    if (typeof adapter[methodName] !== 'function') {
      throw new Error(`Supplier adapter "${supplier}" must implement ${methodName}`);
    }
  }
  if (typeof adapter.supplier !== 'string') {
    throw new Error(`Supplier adapter "${supplier}" is missing supplier identity`);
  }
}
