import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const spec = await readFile(new URL('./openapi.json', import.meta.url));
const products = [
  { id: 'notebook', name: 'Notebook', stock: 12 },
  { id: 'pencil', name: 'Pencil', stock: 3 },
  { id: 'backpack', name: 'Backpack', stock: 0 },
];

// Public, read-only fixture with fictional data. No credentials required.
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { error: 'Only GET is supported' });
  if (path === '/openapi.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(spec);
  }
  if (path === '/products') return send(200, { products });
  const product = products.find(item => path === `/products/${item.id}`);
  if (product) return send(200, product);
  return send(404, { error: 'Not found' });
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log(`Inventory demo listening on port ${server.address().port}`);
});
