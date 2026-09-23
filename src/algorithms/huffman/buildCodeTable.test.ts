import { describe, expect, it } from 'vitest';
import { buildCodeTable, isPrefixFree } from './buildCodeTable';
import { buildHuffmanTree } from './buildTree';
import type { HuffmanCodeTable } from './types';

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

  it('identifica tabelas com prefixos, duplicatas ou caracteres inválidos', () => {
    expect(isPrefixFree(Object.freeze({ 0: '0', 1: '01' }))).toBe(false);
    expect(isPrefixFree(Object.freeze({ 0: '10', 1: '10' }))).toBe(false);
    expect(isPrefixFree(Object.freeze({ 0: '2' }))).toBe(false);
  });

  it('considera a tabela vazia válida', () => {
    expect(isPrefixFree(Object.freeze({}) satisfies HuffmanCodeTable)).toBe(true);
  });
});
