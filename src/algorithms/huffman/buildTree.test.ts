// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCodeTable, isPrefixFree } from './buildCodeTable';
import {
  buildHuffmanTree,
  buildHuffmanTreeFromFrequencies,
  validateHuffmanTree,
} from './buildTree';
import { countFrequencies } from './countFrequencies';
import { InvalidFrequencyTableError, InvalidHuffmanTreeError } from './errors';
import type { HuffmanInternalNode, HuffmanLeaf, HuffmanNode } from './types';

const bytes = (...values: number[]) => Uint8Array.from(values);

function expectValidWeights(node: HuffmanNode): number {
  if (node.kind === 'leaf') return node.weight;
  const childWeight = expectValidWeights(node.left) + expectValidWeights(node.right);
  expect(node.weight).toBe(childWeight);
  return node.weight;
}

describe('countFrequencies', () => {
  it('conta apenas símbolos presentes e os ordena pelo valor do byte', () => {
    const frequencies = countFrequencies(bytes(255, 2, 1, 2, 255, 255));

    expect(frequencies).toEqual([
      { symbol: 1, weight: 1 },
      { symbol: 2, weight: 2 },
      { symbol: 255, weight: 3 },
    ]);
    expect(Object.isFrozen(frequencies)).toBe(true);
    frequencies.forEach((entry) => expect(Object.isFrozen(entry)).toBe(true));
  });

  it('devolve uma tabela vazia para uma entrada vazia', () => {
    expect(countFrequencies(bytes())).toEqual([]);
  });
});

describe('buildHuffmanTree', () => {
  it('constrói a árvore, os códigos e o histórico completo de BANANA', () => {
    const result = buildHuffmanTree(bytes(66, 65, 78, 65, 78, 65));

    expect(result.root?.weight).toBe(6);
    expect(result.history).toHaveLength(2);
    expect(
      result.history.map((step) => [step.firstExtracted.weight, step.secondExtracted.weight]),
    ).toEqual([
      [1, 2],
      [3, 3],
    ]);
    expect(result.history.at(-1)?.merged).toBe(result.root);
    expect(buildCodeTable(result.root)).toEqual({ 65: '0', 66: '10', 78: '11' });
    expect(isPrefixFree(buildCodeTable(result.root))).toBe(true);

    if (result.root === null) throw new Error('A árvore não deveria ser vazia.');
    expectValidWeights(result.root);
    expect(Object.isFrozen(result.root)).toBe(true);
    expect(Object.isFrozen(result.history)).toBe(true);
    result.history.forEach((step) => expect(Object.isFrozen(step)).toBe(true));
  });

  it('define árvore nula, códigos vazios e histórico vazio para entrada vazia', () => {
    const result = buildHuffmanTree(bytes());

    expect(result.root).toBeNull();
    expect(result.history).toEqual([]);
    expect(buildCodeTable(result.root)).toEqual({});
    expect(isPrefixFree(buildCodeTable(result.root))).toBe(true);
  });

  it('atribui o código 0 a um alfabeto unitário', () => {
    const result = buildHuffmanTree(bytes(7, 7, 7, 7));

    expect(result.root).toMatchObject({ kind: 'leaf', symbol: 7, weight: 4 });
    expect(result.history).toEqual([]);
    expect(buildCodeTable(result.root)).toEqual({ 7: '0' });
  });

  it('resolve empates de forma determinística pela ordem dos símbolos e de criação', () => {
    const input = bytes(3, 1, 2, 0);
    const first = buildCodeTable(buildHuffmanTree(input).root);
    const second = buildCodeTable(buildHuffmanTree(input).root);

    expect(first).toEqual({ 0: '00', 1: '01', 2: '10', 3: '11' });
    expect(second).toEqual(first);
  });

  it('aceita outra árvore válida de mesmo custo sem exigir a topologia de referência', () => {
    const leaf = (symbol: number): HuffmanLeaf =>
      Object.freeze({ kind: 'leaf', id: `manual-${symbol}`, symbol, weight: 1 });
    const left = Object.freeze({
      kind: 'internal',
      id: 'manual-left',
      weight: 2,
      left: leaf(2),
      right: leaf(0),
    }) satisfies HuffmanInternalNode;
    const right = Object.freeze({
      kind: 'internal',
      id: 'manual-right',
      weight: 2,
      left: leaf(3),
      right: leaf(1),
    }) satisfies HuffmanInternalNode;
    const root = Object.freeze({
      kind: 'internal',
      id: 'manual-root',
      weight: 4,
      left,
      right,
    }) satisfies HuffmanInternalNode;

    expect(() => validateHuffmanTree(root)).not.toThrow();
    expect(isPrefixFree(buildCodeTable(root))).toBe(true);
  });

  it('rejeita frequências duplicadas ou inválidas de modo controlado', () => {
    expect(() =>
      buildHuffmanTreeFromFrequencies([
        { symbol: 1, weight: 2 },
        { symbol: 1, weight: 3 },
      ]),
    ).toThrow(InvalidFrequencyTableError);
    expect(() => buildHuffmanTreeFromFrequencies([{ symbol: 256, weight: 1 }])).toThrow(
      InvalidFrequencyTableError,
    );
    expect(() => buildHuffmanTreeFromFrequencies([{ symbol: 1, weight: 0 }])).toThrow(
      InvalidFrequencyTableError,
    );
  });

  it('rejeita um pai cujo peso não é a soma dos filhos', () => {
    const left = Object.freeze({
      kind: 'leaf',
      id: 'left',
      symbol: 0,
      weight: 1,
    }) satisfies HuffmanLeaf;
    const right = Object.freeze({
      kind: 'leaf',
      id: 'right',
      symbol: 1,
      weight: 1,
    }) satisfies HuffmanLeaf;
    const invalid = Object.freeze({
      kind: 'internal',
      id: 'root',
      weight: 3,
      left,
      right,
    }) satisfies HuffmanInternalNode;

    expect(() => validateHuffmanTree(invalid)).toThrow(InvalidHuffmanTreeError);
  });
});
