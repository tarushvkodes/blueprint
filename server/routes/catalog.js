export default function register(app, deps) {
  const { catalogApi } = deps;

  app.post('/api/catalog/sync', async (req, res, next) => {
    try {
      const products = await catalogApi.syncRevCatalog({ query: req.body?.query || 'ftc', limit: Number(req.body?.limit || 30) });
      res.json({ synced: products.filter((product) => !product.error).length, products, errors: products.filter((product) => product.error) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/catalog/search', (req, res) => {
    res.json({ query: req.query.q || '', products: catalogApi.searchCatalog(String(req.query.q || ''), Number(req.query.limit || 20)) });
  });

  app.get('/api/catalog/products/:sku', (req, res) => {
    const product = catalogApi.getCatalogProduct(req.params.sku);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });
}
