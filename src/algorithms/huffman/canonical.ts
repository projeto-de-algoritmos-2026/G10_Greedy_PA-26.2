import { validateHuffmanTree } from './buildTree';
import { HuffmanCodecError } from './errors';
import type { HuffmanCodeTable, HuffmanNode, HuffmanSymbol } from './types';

/** Uma árvore com n ≤ 256 folhas tem profundidade máxima n − 1 ≤ 255. */
const MAX_CODE_LENGTH = 255;
const MAX_SYMBOL_COUNT = 256;

export interface SymbolCodeLength {
  readonly symbol: HuffmanSymbol;
  readonly length: number;
}

/** Comprimentos de código, um por símbolo, em ordem crescente de símbolo. */
export type CodeLengthTable = readonly SymbolCodeLength[];

/**
 * Estrutura de decodificação canônica: `counts[l]` é a quantidade de códigos de comprimento `l`
 * e `symbols` lista os símbolos em ordem canônica (comprimento crescente, depois símbolo).
 */
export interface CanonicalDecoder {
  readonly maxLength: number;
  readonly counts: Uint16Array;
  readonly symbols: Uint8Array;
}

function invalidTable(message: string): HuffmanCodecError {
  return new HuffmanCodecError('INVALID_CODE_TABLE', message);
}

function compareCanonical(a: SymbolCodeLength, b: SymbolCodeLength): number {
  return a.length - b.length || a.symbol - b.symbol;
}

/** Profundidade de cada folha. Uma árvore unitária usa 1 bit, como em `buildCodeTable`. */
export function deriveCodeLengths(root: HuffmanNode | null): CodeLengthTable {
  validateHuffmanTree(root);
  const lengths: SymbolCodeLength[] = [];

  const visit = (node: HuffmanNode, depth: number): void => {
    if (node.kind === 'leaf') {
      lengths.push(Object.freeze({ symbol: node.symbol, length: Math.max(depth, 1) }));
      return;
    }
    visit(node.left, depth + 1);
    visit(node.right, depth + 1);
  };

  if (root !== null) visit(root, 0);
  return Object.freeze(lengths.sort((a, b) => a.symbol - b.symbol));
}

/**
 * Confere símbolos, comprimentos e a desigualdade de Kraft. Só um código de prefixo *completo*
 * (Σ 2^−lᵢ = 1) corresponde a uma árvore de Huffman; a única exceção é o símbolo isolado, de
 * 1 bit, que deixa o código "1" sem uso.
 */
export function validateCodeLengths(lengths: CodeLengthTable): void {
  if (lengths.length > MAX_SYMBOL_COUNT) {
    throw invalidTable(
      `A tabela possui ${lengths.length} símbolos; o máximo é ${MAX_SYMBOL_COUNT}.`,
    );
  }

  const seen = new Set<number>();
  let kraft = 0n;
  for (const { symbol, length } of lengths) {
    if (!Number.isInteger(symbol) || symbol < 0 || symbol > 0xff) {
      throw invalidTable(`Símbolo fora do intervalo de byte: ${symbol}.`);
    }
    if (seen.has(symbol)) throw invalidTable(`Símbolo duplicado na tabela: ${symbol}.`);
    seen.add(symbol);
    if (!Number.isInteger(length) || length < 1 || length > MAX_CODE_LENGTH) {
      throw invalidTable(`Comprimento inválido para o símbolo ${symbol}: ${length}.`);
    }
    kraft += 1n << BigInt(MAX_CODE_LENGTH - length);
  }

  if (lengths.length === 0) return;
  if (lengths.length === 1) {
    if (lengths[0]?.length !== 1) {
      throw invalidTable('Um único símbolo deve usar um código de 1 bit.');
    }
    return;
  }
  if (kraft !== 1n << BigInt(MAX_CODE_LENGTH)) {
    throw invalidTable(
      kraft > 1n << BigInt(MAX_CODE_LENGTH)
        ? 'Os comprimentos violam a desigualdade de Kraft (código ambíguo).'
        : 'Os comprimentos deixam códigos sem uso (código incompleto).',
    );
  }
}

/**
 * Atribui códigos canônicos: ordena por (comprimento, símbolo); o primeiro código é só zeros e
 * cada seguinte é o anterior + 1, deslocado à esquerda quando o comprimento cresce. Os
 * comprimentos bastam para reconstruir a tabela; a topologia da árvore original não é necessária.
 *
 * BigInt evita estouro: uma árvore montada à mão pode ter códigos de até 255 bits.
 */
export function buildCanonicalCodeTable(lengths: CodeLengthTable): HuffmanCodeTable {
  validateCodeLengths(lengths);
  const ordered = [...lengths].sort(compareCanonical);
  const table: Partial<Record<number, string>> = {};

  let code = 0n;
  let previousLength = ordered[0]?.length ?? 0;
  for (const { symbol, length } of ordered) {
    code <<= BigInt(length - previousLength);
    table[symbol] = code.toString(2).padStart(length, '0');
    code += 1n;
    previousLength = length;
  }
  return Object.freeze(table);
}

/** Tabela canônica equivalente (mesmos comprimentos) a uma árvore de Huffman. */
export function buildCanonicalCodeTableFromTree(root: HuffmanNode | null): HuffmanCodeTable {
  return buildCanonicalCodeTable(deriveCodeLengths(root));
}

/**
 * Serializa a tabela como `n (u16 BE) ‖ Lmax (u8) ‖ contagens dos comprimentos 1..Lmax−1 (u8 cada)
 * ‖ n símbolos em ordem canônica`. A contagem de Lmax é implícita (n − Σ demais); por isso cabe
 * em um byte mesmo quando os 256 símbolos usam o mesmo comprimento. Tabela vazia ocupa só `n = 0`.
 */
export function serializeCanonicalTable(lengths: CodeLengthTable): Uint8Array {
  validateCodeLengths(lengths);
  const ordered = [...lengths].sort(compareCanonical);
  const bytes: number[] = [ordered.length >>> 8, ordered.length & 0xff];
  if (ordered.length === 0) return Uint8Array.from(bytes);

  const maxLength = ordered[ordered.length - 1]?.length ?? 0;
  const counts = new Array<number>(maxLength + 1).fill(0);
  for (const { length } of ordered) counts[length] = (counts[length] ?? 0) + 1;

  bytes.push(maxLength);
  for (let length = 1; length < maxLength; length++) bytes.push(counts[length] ?? 0);
  for (const { symbol } of ordered) bytes.push(symbol);
  return Uint8Array.from(bytes);
}

/**
 * Reconstrói os comprimentos a partir de `bytes[offset..]` e informa quantos bytes a tabela
 * ocupa, para que o chamador saiba onde o payload começa. Recusa tabelas truncadas, símbolos
 * repetidos, grupos fora de ordem canônica e comprimentos que não formam um código completo.
 */
export function deserializeCanonicalTable(
  bytes: Uint8Array,
  offset = 0,
): { readonly lengths: CodeLengthTable; readonly byteLength: number } {
  let position = offset;
  const readByte = (): number => {
    const value = bytes[position];
    if (value === undefined) {
      throw new HuffmanCodecError('TRUNCATED_HEADER', 'O cabeçalho terminou antes do esperado.');
    }
    position += 1;
    return value;
  };

  const symbolCount = readByte() * 0x100 + readByte();
  if (symbolCount > MAX_SYMBOL_COUNT) {
    throw invalidTable(`A tabela declara ${symbolCount} símbolos; o máximo é ${MAX_SYMBOL_COUNT}.`);
  }
  if (symbolCount === 0) {
    return Object.freeze({ lengths: Object.freeze([]), byteLength: position - offset });
  }

  const maxLength = readByte();
  if (maxLength < 1) throw invalidTable('O comprimento máximo do código deve ser positivo.');

  const counts = new Array<number>(maxLength + 1).fill(0);
  let assigned = 0;
  for (let length = 1; length < maxLength; length++) {
    const count = readByte();
    counts[length] = count;
    assigned += count;
  }
  const lastCount = symbolCount - assigned;
  if (lastCount < 1) {
    throw invalidTable(
      'As contagens por comprimento não são compatíveis com o número de símbolos.',
    );
  }
  counts[maxLength] = lastCount;

  const lengths: SymbolCodeLength[] = [];
  const seen = new Set<number>();
  for (let length = 1; length <= maxLength; length++) {
    let previousSymbol = -1;
    for (let index = 0; index < (counts[length] ?? 0); index++) {
      const symbol = readByte();
      if (seen.has(symbol)) throw invalidTable(`Símbolo duplicado na tabela: ${symbol}.`);
      if (symbol < previousSymbol) {
        throw invalidTable(`Símbolos de comprimento ${length} fora da ordem canônica.`);
      }
      seen.add(symbol);
      previousSymbol = symbol;
      lengths.push(Object.freeze({ symbol, length }));
    }
  }

  validateCodeLengths(lengths);
  return Object.freeze({
    lengths: Object.freeze(lengths.sort((a, b) => a.symbol - b.symbol)),
    byteLength: position - offset,
  });
}

/** Estrutura enxuta para decodificar sem árvore: apenas contagens por comprimento e símbolos. */
export function buildCanonicalDecoder(lengths: CodeLengthTable): CanonicalDecoder {
  validateCodeLengths(lengths);
  const ordered = [...lengths].sort(compareCanonical);
  const maxLength = ordered[ordered.length - 1]?.length ?? 0;
  const counts = new Uint16Array(maxLength + 1);
  for (const { length } of ordered) counts[length] = (counts[length] ?? 0) + 1;

  return Object.freeze({
    maxLength,
    counts,
    symbols: Uint8Array.from(ordered, ({ symbol }) => symbol),
  });
}

export interface CanonicalSymbolReader {
  /** Consome um bit; devolve o símbolo ao fechar um código ou `null` se ainda faltam bits. */
  next(bit: 0 | 1): HuffmanSymbol | null;
  /** `true` quando nenhum código está parcialmente lido. */
  readonly atBoundary: boolean;
}

/**
 * Decodifica um bit por vez sem materializar a árvore (técnica do `puff.c`). `offset` é
 * `código − primeiro código do comprimento atual`; mantê-lo relativo evita aritmética em 255 bits.
 * Lança se nenhum código da tabela começa com o prefixo lido.
 */
export function createCanonicalSymbolReader(decoder: CanonicalDecoder): CanonicalSymbolReader {
  let length = 0;
  let offset = 0;
  let base = 0;

  return {
    get atBoundary() {
      return length === 0;
    },
    next(bit) {
      length += 1;
      if (length > decoder.maxLength) {
        throw invalidTable('O payload contém um código que não pertence à tabela canônica.');
      }
      const value = offset + bit;
      const count = decoder.counts[length] ?? 0;
      if (value < count) {
        const symbol = decoder.symbols[base + value];
        length = 0;
        offset = 0;
        base = 0;
        if (symbol === undefined) throw invalidTable('Índice de símbolo canônico inexistente.');
        return symbol;
      }
      if (length === decoder.maxLength) {
        throw invalidTable('O payload contém um código que não pertence à tabela canônica.');
      }
      base += count;
      offset = (value - count) * 2;
      return null;
    },
  };
}
