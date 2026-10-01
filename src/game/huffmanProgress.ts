import { validateHuffmanTree } from '../algorithms/huffman';
import type {
  FrequencyTable,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMergeStep,
  HuffmanNode,
} from '../algorithms/huffman';
import type { HuffmanMergeAssessment, HuffmanMergeChoice, HuffmanProgress } from './types';

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

function compareActiveNodes(first: ActiveNode, second: ActiveNode): number {
  return first.node.weight - second.node.weight || first.insertionOrder - second.insertionOrder;
}

/** Avalia uma escolha antes da fusão sem alterar o progresso serializado. */
export function assessHuffmanMergeChoice(
  activeNodes: readonly HuffmanNode[],
  firstNodeId: string,
  secondNodeId: string,
): HuffmanMergeAssessment {
  if (firstNodeId === secondNodeId) {
    throw new InvalidGameStateError('Uma fusão exige dois nós diferentes.');
  }
  const nodesById = new Map(activeNodes.map((node) => [node.id, node]));
  const firstNode = nodesById.get(firstNodeId);
  const secondNode = nodesById.get(secondNodeId);
  if (firstNode === undefined || secondNode === undefined) {
    throw new InvalidGameStateError('A fusão referencia um nó inexistente ou já consumido.');
  }

  const [smallest, secondSmallest] = activeNodes.map((node) => node.weight).sort((a, b) => a - b);
  const [low, high] = [firstNode.weight, secondNode.weight].sort((a, b) => a - b);
  return Object.freeze({
    firstNode,
    secondNode,
    mergedWeight: firstNode.weight + secondNode.weight,
    followsGreedyRule: low === smallest && high === secondSmallest,
  });
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
    const first = activeNodes.get(choice.firstNodeId);
    const second = activeNodes.get(choice.secondNodeId);
    const assessment = assessHuffmanMergeChoice(
      [...activeNodes.values()].map((entry) => entry.node),
      choice.firstNodeId,
      choice.secondNodeId,
    );
    // A avaliação acima também valida os identificadores; estas referências existem neste ponto.
    if (first === undefined || second === undefined)
      throw new InvalidGameStateError('Fusão inválida.');

    greedyChoiceHistory.push(assessment.followsGreedyRule);
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

  // A ordem exposta corresponde à prioridade de extração da min-heap, com desempate estável.
  const remaining = Object.freeze(
    [...activeNodes.values()].sort(compareActiveNodes).map((entry) => entry.node),
  );
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
