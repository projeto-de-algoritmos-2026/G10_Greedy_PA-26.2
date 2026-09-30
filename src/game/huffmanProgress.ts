import { validateHuffmanTree } from '../algorithms/huffman';
import type {
  FrequencyTable,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMergeStep,
  HuffmanNode,
} from '../algorithms/huffman';
import type { HuffmanMergeChoice, HuffmanProgress } from './types';

export class InvalidGameStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGameStateError';
  }
}

interface ActiveNode {
  readonly node: HuffmanNode;
  readonly insertionOrder: number;
}

function createInitialNodes(frequencies: FrequencyTable): ActiveNode[] {
  return [...frequencies]
    .sort((a, b) => a.symbol - b.symbol)
    .map((frequency, index) => ({
      node: Object.freeze({
        kind: 'leaf',
        id: `leaf-${frequency.symbol}`,
        symbol: frequency.symbol,
        weight: frequency.weight,
      }) satisfies HuffmanLeaf,
      insertionOrder: index,
    }));
}

function greedyPair(activeNodes: ReadonlyMap<string, ActiveNode>): readonly [string, string] {
  const sorted = [...activeNodes.values()].sort(
    (a, b) => a.node.weight - b.node.weight || a.insertionOrder - b.insertionOrder,
  );
  const first = sorted[0];
  const second = sorted[1];
  if (first === undefined || second === undefined) {
    throw new InvalidGameStateError('Não há dois nós ativos para realizar uma fusão.');
  }
  return [first.node.id, second.node.id];
}

/** Reconstrói árvore e histórico sem armazenar nós derivados no estado do jogo. */
export function replayHuffmanMerges(
  frequencies: FrequencyTable,
  choices: readonly HuffmanMergeChoice[],
): HuffmanProgress {
  const initialNodes = createInitialNodes(frequencies);
  const activeNodes = new Map(initialNodes.map((entry) => [entry.node.id, entry]));
  const history: HuffmanMergeStep[] = [];
  const greedyChoiceHistory: boolean[] = [];

  for (const [index, choice] of choices.entries()) {
    if (choice.firstNodeId === choice.secondNodeId) {
      throw new InvalidGameStateError('Uma fusão exige dois nós diferentes.');
    }
    const first = activeNodes.get(choice.firstNodeId);
    const second = activeNodes.get(choice.secondNodeId);
    if (first === undefined || second === undefined) {
      throw new InvalidGameStateError('A fusão referencia um nó inexistente ou já consumido.');
    }

    const recommended = greedyPair(activeNodes);
    greedyChoiceHistory.push(
      (recommended[0] === choice.firstNodeId && recommended[1] === choice.secondNodeId) ||
        (recommended[0] === choice.secondNodeId && recommended[1] === choice.firstNodeId),
    );
    activeNodes.delete(choice.firstNodeId);
    activeNodes.delete(choice.secondNodeId);

    const merged = Object.freeze({
      kind: 'internal',
      id: `branch-${index}`,
      weight: first.node.weight + second.node.weight,
      left: first.node,
      right: second.node,
    }) satisfies HuffmanInternalNode;
    history.push(
      Object.freeze({
        index,
        firstExtracted: first.node,
        secondExtracted: second.node,
        merged,
      }),
    );
    activeNodes.set(merged.id, {
      node: merged,
      insertionOrder: initialNodes.length + index,
    });
  }

  const remaining = Object.freeze([...activeNodes.values()].map((entry) => entry.node));
  const complete = remaining.length === 1;
  const root = complete ? (remaining[0] ?? null) : null;
  if (root !== null) validateHuffmanTree(root);

  return Object.freeze({
    activeNodes: remaining,
    history: Object.freeze(history),
    greedyChoiceHistory: Object.freeze(greedyChoiceHistory),
    allChoicesGreedy: greedyChoiceHistory.every(Boolean),
    root,
    complete,
  });
}
