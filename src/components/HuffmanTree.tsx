import type { HuffmanNode } from '../algorithms/huffman';
import type { TelemetrySymbolDefinition } from '../domain';

interface HuffmanTreeProps {
  readonly root: HuffmanNode | null;
  readonly title: string;
  readonly alphabet: readonly TelemetrySymbolDefinition[];
}

interface PositionedNode {
  readonly node: HuffmanNode;
  readonly x: number;
  readonly y: number;
}

interface PositionedEdge {
  readonly parent: PositionedNode;
  readonly child: PositionedNode;
  readonly bit: '0' | '1';
}

function countLeaves(node: HuffmanNode): number {
  return node.kind === 'leaf' ? 1 : countLeaves(node.left) + countLeaves(node.right);
}

function layoutTree(root: HuffmanNode) {
  const width = Math.max(360, countLeaves(root) * 120);
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  let leafIndex = 0;
  let maxDepth = 0;

  const visit = (node: HuffmanNode, depth: number): PositionedNode => {
    maxDepth = Math.max(maxDepth, depth);
    const y = 38 + depth * 90;
    if (node.kind === 'leaf') {
      const positioned = { node, x: ((leafIndex + 0.5) * width) / countLeaves(root), y };
      leafIndex += 1;
      nodes.push(positioned);
      return positioned;
    }

    const left = visit(node.left, depth + 1);
    const right = visit(node.right, depth + 1);
    const positioned = { node, x: (left.x + right.x) / 2, y };
    nodes.push(positioned);
    edges.push({ parent: positioned, child: left, bit: '0' });
    edges.push({ parent: positioned, child: right, bit: '1' });
    return positioned;
  };

  visit(root, 0);
  return { width, height: 76 + maxDepth * 90, nodes, edges };
}

function TextTree({
  node,
  path,
  labels,
}: {
  readonly node: HuffmanNode;
  readonly path: string;
  readonly labels: ReadonlyMap<number, string>;
}) {
  const description =
    node.kind === 'leaf'
      ? `Folha ${labels.get(node.symbol) ?? `símbolo ${node.symbol}`}, frequência ${node.weight}, código ${path || '0'}`
      : `Nó interno de peso ${node.weight}${path === '' ? ', raiz' : `, prefixo ${path}`}`;

  return (
    <li>
      {description}
      {node.kind === 'internal' && (
        <ul>
          <TextTree node={node.left} path={`${path}0`} labels={labels} />
          <TextTree node={node.right} path={`${path}1`} labels={labels} />
        </ul>
      )}
    </li>
  );
}

/** Visualização da topologia; pesos, símbolos e arestas vêm da árvore calculada. */
export function HuffmanTree({ root, title, alphabet }: HuffmanTreeProps) {
  if (root === null) return <p>Nenhuma fusão disponível para visualizar.</p>;

  const labels = new Map(alphabet.map((symbol) => [symbol.value, symbol.label]));
  const { width, height, nodes, edges } = layoutTree(root);
  const titleId = `tree-title-${root.id}`;
  const descriptionId = `tree-description-${root.id}`;

  return (
    <figure className="huffman-tree">
      <figcaption id={titleId}>{title}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <desc id={descriptionId}>
          Árvore de Huffman. Arestas à esquerda representam zero e à direita representam um.
        </desc>
        {edges.map((edge) => (
          <g key={`${edge.parent.node.id}-${edge.child.node.id}`}>
            <line x1={edge.parent.x} y1={edge.parent.y} x2={edge.child.x} y2={edge.child.y} />
            <text
              className="tree-bit"
              x={(edge.parent.x + edge.child.x) / 2}
              y={(edge.parent.y + edge.child.y) / 2 - 4}
            >
              {edge.bit}
            </text>
          </g>
        ))}
        {nodes.map(({ node, x, y }) => (
          <g key={node.id} transform={`translate(${x} ${y})`}>
            <circle r="25" className={node.kind === 'leaf' ? 'tree-leaf' : 'tree-branch'} />
            <text textAnchor="middle" y="-3">
              {node.kind === 'leaf' ? `S${node.symbol}` : '+'}
            </text>
            <text textAnchor="middle" y="14" className="tree-weight">
              {node.weight}
            </text>
          </g>
        ))}
      </svg>
      <details className="tree-text">
        <summary>Alternativa textual da árvore</summary>
        <ul>
          <TextTree node={root} path="" labels={labels} />
        </ul>
      </details>
    </figure>
  );
}
