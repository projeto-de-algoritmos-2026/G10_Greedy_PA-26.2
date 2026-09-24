import { MinHeap } from '../heap';
import { countFrequencies } from './countFrequencies';
import { InvalidFrequencyTableError, InvalidHuffmanTreeError } from './errors';
import type {
  FrequencyTable,
  HuffmanBuildResult,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMergeStep,
  HuffmanNode,
  SymbolFrequency,
} from './types';

const BYTE_MAX = 0xff;

function normalizeFrequencies(frequencies: FrequencyTable): FrequencyTable {
  const seen = new Set<number>();
  let totalWeight = 0;
  const normalized = frequencies.map(({ symbol, weight }) => {
    if (!Number.isInteger(symbol) || symbol < 0 || symbol > BYTE_MAX) {
      throw new InvalidFrequencyTableError(`Símbolo fora do intervalo de byte: ${symbol}.`);
    }
    if (!Number.isSafeInteger(weight) || weight <= 0) {
      throw new InvalidFrequencyTableError(`Peso inválido para o símbolo ${symbol}: ${weight}.`);
    }
    if (seen.has(symbol)) {
      throw new InvalidFrequencyTableError(`Símbolo duplicado na tabela: ${symbol}.`);
    }
    seen.add(symbol);
    totalWeight += weight;
    if (!Number.isSafeInteger(totalWeight)) {
      throw new InvalidFrequencyTableError('A soma das frequências excede o limite seguro.');
    }
    return Object.freeze({ symbol, weight }) satisfies SymbolFrequency;
  });

  normalized.sort((a, b) => a.symbol - b.symbol);
  return Object.freeze(normalized);
}

function createLeaf({ symbol, weight }: SymbolFrequency): HuffmanLeaf {
  return Object.freeze({ kind: 'leaf', id: `leaf-${symbol}`, symbol, weight });
}

function createParent(index: number, left: HuffmanNode, right: HuffmanNode): HuffmanInternalNode {
  return Object.freeze({
    kind: 'internal',
    id: `branch-${index}`,
    weight: left.weight + right.weight,
    left,
    right,
  });
}

/**
 * Constrói a árvore ótima a partir de uma tabela de frequências.
 *
 * As folhas entram na heap em ordem crescente de símbolo. Como a MinHeap desempata por ordem
 * de chegada, pesos iguais são resolvidos de forma determinística, sem invalidar outras árvores
 * de mesmo custo.
 */
export function buildHuffmanTreeFromFrequencies(
  sourceFrequencies: FrequencyTable,
): HuffmanBuildResult {
  const frequencies = normalizeFrequencies(sourceFrequencies);
  const heap = new MinHeap<HuffmanNode>((a, b) => a.weight - b.weight, frequencies.map(createLeaf));
  const history: HuffmanMergeStep[] = [];

  while (heap.size > 1) {
    const firstExtracted = heap.pop();
    const secondExtracted = heap.pop();
    const merged = createParent(history.length, firstExtracted, secondExtracted);
    const step: HuffmanMergeStep = Object.freeze({
      index: history.length,
      firstExtracted,
      secondExtracted,
      merged,
    });
    history.push(step);
    heap.push(merged);
  }

  return Object.freeze({
    frequencies,
    root: heap.isEmpty() ? null : heap.pop(),
    history: Object.freeze(history),
  });
}

/** Conta as frequências e constrói a árvore Huffman de referência. */
export function buildHuffmanTree(data: Uint8Array): HuffmanBuildResult {
  return buildHuffmanTreeFromFrequencies(countFrequencies(data));
}

/** Valida invariantes estruturais sem exigir uma topologia específica para empates. */
export function validateHuffmanTree(root: HuffmanNode | null): void {
  if (root === null) return;

  const visited = new Set<HuffmanNode>();
  const symbols = new Set<number>();

  const visit = (node: HuffmanNode): number => {
    if (visited.has(node))
      throw new InvalidHuffmanTreeError('A árvore contém ciclo ou nó repetido.');
    visited.add(node);

    if (!Number.isSafeInteger(node.weight) || node.weight <= 0) {
      throw new InvalidHuffmanTreeError(`Peso inválido no nó ${node.id}.`);
    }

    if (node.kind === 'leaf') {
      if (!Number.isInteger(node.symbol) || node.symbol < 0 || node.symbol > BYTE_MAX) {
        throw new InvalidHuffmanTreeError(`Símbolo inválido na folha ${node.id}.`);
      }
      if (symbols.has(node.symbol)) {
        throw new InvalidHuffmanTreeError(`Símbolo duplicado na árvore: ${node.symbol}.`);
      }
      symbols.add(node.symbol);
      return node.weight;
    }

    const childWeight = visit(node.left) + visit(node.right);
    if (node.weight !== childWeight) {
      throw new InvalidHuffmanTreeError(
        `O peso do nó ${node.id} deveria ser ${childWeight}, mas é ${node.weight}.`,
      );
    }
    return node.weight;
  };

  visit(root);
}
