import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  await import('@testing-library/jest-dom/vitest');

  // Sem `globals: true` o Testing Library não registra o cleanup sozinho.
  afterEach(cleanup);
}
