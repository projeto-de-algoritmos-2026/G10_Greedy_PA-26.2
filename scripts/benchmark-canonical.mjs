// Lançador do benchmark Huffman canônico. Os módulos são TypeScript com imports sem extensão,
// então são carregados pelo servidor SSR do Vite (o mesmo resolvedor usado por dev e testes).
// Uso: npm run bench:canonical [-- --iterations 25]
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const { main } = await server.ssrLoadModule('/scripts/canonicalBenchmark.ts');
  await main(process.argv.slice(2));
} finally {
  await server.close();
}
