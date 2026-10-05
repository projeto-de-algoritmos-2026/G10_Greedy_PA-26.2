// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { PROGRESS_STORAGE_KEY, readStoredProgress, writeStoredProgress } from './progressStorage';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
  };
}

const failingStorage = {
  getItem: (): string => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('armazenamento local do progresso', () => {
  it('grava e lê o mesmo documento', () => {
    const storage = createMemoryStorage();
    const progress = { schemaVersion: 1, results: { alpha: { completions: 1 } } };

    expect(writeStoredProgress(storage, progress)).toBe(true);
    expect([...storage.entries.keys()]).toEqual([PROGRESS_STORAGE_KEY]);
    expect(readStoredProgress(storage)).toEqual(progress);
  });

  it('devolve null quando não há progresso, o JSON está corrompido ou a leitura falha', () => {
    expect(readStoredProgress(createMemoryStorage())).toBeNull();
    expect(
      readStoredProgress(createMemoryStorage({ [PROGRESS_STORAGE_KEY]: '{ "a": ' })),
    ).toBeNull();
    expect(readStoredProgress(failingStorage)).toBeNull();
    expect(readStoredProgress(null)).toBeNull();
  });

  it('informa falha de gravação sem lançar', () => {
    expect(writeStoredProgress(failingStorage, {})).toBe(false);
    expect(writeStoredProgress(null, {})).toBe(false);
  });
});
