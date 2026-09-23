import { validateHuffmanTree } from './buildTree';
import type { HuffmanCodeTable, HuffmanNode } from './types';

/** Gera uma tabela símbolo → código. Uma árvore unitária usa o código "0". */
export function buildCodeTable(root: HuffmanNode | null): HuffmanCodeTable {
  validateHuffmanTree(root);
  const table: Partial<Record<number, string>> = {};

  const visit = (node: HuffmanNode, prefix: string): void => {
    if (node.kind === 'leaf') {
      table[node.symbol] = prefix || '0';
      return;
    }
    visit(node.left, `${prefix}0`);
    visit(node.right, `${prefix}1`);
  };

  if (root !== null) visit(root, '');
  return Object.freeze(table);
}

/** Verifica a propriedade de prefixo sem fazer suposições sobre a forma da árvore. */
export function isPrefixFree(table: HuffmanCodeTable): boolean {
  const codes = Object.values(table).filter((code): code is string => code !== undefined);
  if (codes.some((code) => code.length === 0 || /[^01]/u.test(code))) return false;

  for (let first = 0; first < codes.length; first++) {
    const candidate = codes[first];
    if (candidate === undefined) return false;
    for (let second = 0; second < codes.length; second++) {
      if (first === second) continue;
      const other = codes[second];
      if (other === undefined || other.startsWith(candidate)) return false;
    }
  }
  return true;
}
