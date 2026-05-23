export default function register(app, deps) {
  const { catalogApi } = deps;
  const parseSupplier = (value) => String(value || 'rev').trim().toLowerCase();

  app.post('/api/catalog/sync', async (req, res, next) => {
    try {
      const supplier = parseSupplier(req.query.supplier || req.body?.supplier || 'rev');
      const products = await catalogApi.syncCatalog({
        supplier,
        query: req.body?.query || 'ftc',
        limit: Number(req.body?.limit || 3),
      });
      res.json({
        supplier,
        synced: products.filter((product) => !product.error).length,
        products,
        errors: products.filter((product) => product.error),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/catalog/search', (req, res, next) => {
    try {
      const supplier = parseSupplier(req.query.supplier || 'rev');
      const products = catalogApi.searchCatalog(String(req.query.q || ''), {
        limit: Number(req.query.limit || 20),
        supplier,
      });
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/catalog/products/:sku', (req, res, next) => {
    try {
      const supplier = parseSupplier(req.query.supplier || 'rev');
      const product = catalogApi.getCatalogProduct(req.params.sku, supplier);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json({ ...product, supplier });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/catalog/products/:sku/override', async (req, res, next) => {
    try {
      const supplier = parseSupplier(req.query.supplier || req.body?.supplier || 'rev');
      const product = await catalogApi.setCatalogOverride(req.params.sku, {
        supplier,
        price: req.body?.price,
        stock: req.body?.stock,
        notes: req.body?.notes,
      });
      res.json({
        supplier,
        sku: String(req.params.sku || '').toUpperCase(),
        override: {
          price: req.body?.price,
          stock: req.body?.stock,
          notes: req.body?.notes,
        },
        product,
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/catalog/products/:sku/override', async (req, res, next) => {
    try {
      const supplier = parseSupplier(req.query.supplier || 'rev');
      const deleted = await catalogApi.deleteCatalogOverride(req.params.sku, { supplier });
      res.json({ supplier, sku: String(req.params.sku || '').toUpperCase(), deleted });
    } catch (error) {
      next(error);
    }
  });
}
