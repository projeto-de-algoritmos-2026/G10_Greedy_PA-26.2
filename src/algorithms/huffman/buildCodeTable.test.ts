// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { generateByteCorpus } from '../../test/random';
import type { ByteDistribution } from '../../test/random';
import { buildCodeTable, isPrefixFree } from './buildCodeTable';
import { buildHuffmanTree } from './buildTree';
import type { HuffmanCodeTable } from './types';

interface GeneratedCorpusCase {
  readonly name: string;
  readonly alphabet: readonly number[];
  readonly length: number;
  readonly distribution: ByteDistribution;
  readonly seed: number;
}

const prefixPropertyCases: readonly GeneratedCorpusCase[] = [
  { name: 'vazio', alphabet: [], length: 0, distribution: 'uniform', seed: 1 },
  { name: 'unitário', alphabet: [42], length: 31, distribution: 'skewed', seed: 2 },
  {
    name: 'esparso uniforme',
    alphabet: [0, 17, 128, 255],
    length: 257,
    distribution: 'uniform',
    seed: 3,
  },
  {
    name: 'frequências empatadas',
    alphabet: Array.from({ length: 16 }, (_, index) => index * 17),
    length: 1024,
    distribution: 'tied',
    seed: 4,
  },
  {
    name: 'distribuição enviesada',
    alphabet: [1, 2, 3, 5, 8, 13, 21, 34],
    length: 1024,
    distribution: 'skewed',
    seed: 5,
  },
  {
    name: 'alfabeto completo',
    alphabet: Array.from({ length: 256 }, (_, symbol) => symbol),
    length: 2048,
    distribution: 'uniform',
    seed: 6,
  },
];

describe('buildCodeTable', () => {
  it('gera um código para cada símbolo presente', () => {
    const data = Uint8Array.of(10, 20, 30, 10, 20, 10);
    const table = buildCodeTable(buildHuffmanTree(data).root);

    expect(
      Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([10, 20, 30]);
    expect(Object.isFrozen(table)).toBe(true);
  });

  it('produz códigos livres de prefixo', () => {
    const data = Uint8Array.from({ length: 32 }, (_, index) => index % 7);
    const table = buildCodeTable(buildHuffmanTree(data).root);

    expect(isPrefixFree(table)).toBe(true);
  });

  it.each(prefixPropertyCases)(
    'mantém todos os códigos livres de prefixo no corpus $name',
    ({ alphabet, length, distribution, seed }) => {
      const data = generateByteCorpus({ alphabet, length, distribution, seed });
      const table = buildCodeTable(buildHuffmanTree(data).root);
      const presentSymbols = [...new Set(data)].sort((a, b) => a - b);
      const encodedSymbols = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b);

      expect(encodedSymbols).toEqual(presentSymbols);
      expect(
        Object.values(table).every((code) => code !== undefined && /^[01]+$/u.test(code)),
      ).toBe(true);
      expect(isPrefixFree(table)).toBe(true);
    },
  );

  it('identifica tabelas com prefixos, duplicatas ou caracteres inválidos', () => {
    expect(isPrefixFree(Object.freeze({ 0: '0', 1: '01' }))).toBe(false);
    expect(isPrefixFree(Object.freeze({ 0: '10', 1: '10' }))).toBe(false);
    expect(isPrefixFree(Object.freeze({ 0: '2' }))).toBe(false);
  });

  it('considera a tabela vazia válida', () => {
    expect(isPrefixFree(Object.freeze({}) satisfies HuffmanCodeTable)).toBe(true);
  });
});
