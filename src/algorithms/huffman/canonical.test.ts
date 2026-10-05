// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCodeTable, isPrefixFree } from './buildCodeTable';
import { buildHuffmanTree, buildHuffmanTreeFromFrequencies } from './buildTree';
import {
  buildCanonicalCodeTable,
  buildCanonicalCodeTableFromTree,
  buildCanonicalDecoder,
  createCanonicalSymbolReader,
  deriveCodeLengths,
  deserializeCanonicalTable,
  serializeCanonicalTable,
  validateCodeLengths,
} from './canonical';
import type { CodeLengthTable } from './canonical';
import { HuffmanCodecError } from './errors';

const lengthsOf = (...pairs: readonly (readonly [number, number])[]): CodeLengthTable =>
  pairs.map(([symbol, length]) => ({ symbol, length }));

const codeErrorOf = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    if (error instanceof HuffmanCodecError) return error.code;
    throw error;
  }
  return undefined;
};

describe('deriveCodeLengths', () => {
  it('devolve a profundidade de cada folha, ordenada por símbolo', () => {
    const { root } = buildHuffmanTreeFromFrequencies([
      { symbol: 3, weight: 1 },
      { symbol: 1, weight: 1 },
      { symbol: 2, weight: 2 },
      { symbol: 0, weight: 4 },
    ]);
    const lengths = deriveCodeLengths(root);
    expect(lengths.map(({ symbol }) => symbol)).toEqual([0, 1, 2, 3]);
    const table = buildCodeTable(root);
    for (const { symbol, length } of lengths) expect(table[symbol]?.length).toBe(length);
  });

  it('usa 1 bit para árvore unitária e devolve vazio para árvore vazia', () => {
    const single = buildHuffmanTree(Uint8Array.of(9, 9, 9)).root;
    expect(deriveCodeLengths(single)).toEqual([{ symbol: 9, length: 1 }]);
    expect(deriveCodeLengths(null)).toEqual([]);
  });
});

describe('buildCanonicalCodeTable', () => {
  it('atribui códigos conforme a regra canônica (exemplo clássico)', () => {
    // Comprimentos 2,1,3,3: A=10, B=0, C=110, D=111.
    const table = buildCanonicalCodeTable(lengthsOf([65, 2], [66, 1], [67, 3], [68, 3]));
    expect(table).toEqual({ 65: '10', 66: '0', 67: '110', 68: '111' });
  });

  it('desempata por símbolo crescente dentro do mesmo comprimento', () => {
    const table = buildCanonicalCodeTable(lengthsOf([200, 2], [5, 2], [100, 2], [7, 2]));
    expect(table).toEqual({ 5: '00', 7: '01', 100: '10', 200: '11' });
  });

  it('é independente da ordem de entrada', () => {
    const a = buildCanonicalCodeTable(lengthsOf([1, 1], [2, 2], [3, 2]));
    const b = buildCanonicalCodeTable(lengthsOf([3, 2], [1, 1], [2, 2]));
    expect(a).toEqual(b);
  });

  it('mantém os comprimentos da árvore e produz código livre de prefixo', () => {
    const data = Uint8Array.from({ length: 500 }, (_, index) => (index * index) % 37);
    const { root } = buildHuffmanTree(data);
    const treeTable = buildCodeTable(root);
    const canonical = buildCanonicalCodeTableFromTree(root);

    expect(isPrefixFree(canonical)).toBe(true);
    for (const symbol of Object.keys(treeTable).map(Number)) {
      expect(canonical[symbol]?.length).toBe(treeTable[symbol]?.length);
    }
  });

  it('usa o código "0" para um símbolo isolado, como a tabela da árvore', () => {
    expect(buildCanonicalCodeTable(lengthsOf([42, 1]))).toEqual({ 42: '0' });
  });

  it('suporta códigos de 255 bits sem perder precisão', () => {
    // Cadeia degenerada: comprimentos 1,2,...,254,255,255.
    const pairs = Array.from({ length: 255 }, (_, index) => [index, index + 1] as const);
    const table = buildCanonicalCodeTable(lengthsOf(...pairs, [255, 255]));
    expect(table[0]).toBe('0');
    expect(table[254]).toBe(`${'1'.repeat(254)}0`);
    expect(table[255]).toBe('1'.repeat(255));
    expect(isPrefixFree(table)).toBe(true);
  });
});

describe('validateCodeLengths', () => {
  it.each([
    ['símbolo repetido', lengthsOf([1, 1], [1, 1])],
    ['símbolo fora do byte', lengthsOf([256, 1], [1, 1])],
    ['comprimento zero', lengthsOf([1, 0], [2, 1])],
    ['comprimento acima de 255', lengthsOf([1, 256], [2, 1])],
    ['Kraft violado', lengthsOf([1, 1], [2, 1], [3, 1])],
    ['código incompleto', lengthsOf([1, 2], [2, 2], [3, 2])],
    ['símbolo único com 2 bits', lengthsOf([1, 2])],
  ])('recusa %s', (_name, lengths) => {
    expect(codeErrorOf(() => validateCodeLengths(lengths))).toBe('INVALID_CODE_TABLE');
  });

  it('aceita tabela vazia, símbolo isolado e código completo', () => {
    expect(() => validateCodeLengths([])).not.toThrow();
    expect(() => validateCodeLengths(lengthsOf([7, 1]))).not.toThrow();
    expect(() => validateCodeLengths(lengthsOf([1, 1], [2, 2], [3, 2]))).not.toThrow();
  });
});

describe('serialização da tabela canônica', () => {
  it('usa n ‖ Lmax ‖ contagens ‖ símbolos em ordem canônica', () => {
    // Comprimentos: 66→1, 65→2, 67→3, 68→3.
    const bytes = serializeCanonicalTable(lengthsOf([65, 2], [66, 1], [67, 3], [68, 3]));
    expect([...bytes]).toEqual([0, 4, 3, 1, 1, 66, 65, 67, 68]);
  });

  it('reconstrói exatamente os comprimentos (ida e volta)', () => {
    const data = Uint8Array.from({ length: 3000 }, (_, index) => (index * 7 + (index >> 3)) % 200);
    const lengths = deriveCodeLengths(buildHuffmanTree(data).root);
    const bytes = serializeCanonicalTable(lengths);
    const restored = deserializeCanonicalTable(bytes);

    expect(restored.lengths).toEqual(lengths);
    expect(restored.byteLength).toBe(bytes.length);
  });

  it('informa onde a tabela termina e respeita o deslocamento inicial', () => {
    const table = serializeCanonicalTable(lengthsOf([1, 1], [2, 2], [3, 2]));
    const framed = Uint8Array.from([0xaa, 0xbb, ...table, 0xcc]);
    const restored = deserializeCanonicalTable(framed, 2);
    expect(restored.byteLength).toBe(table.length);
    expect(restored.lengths).toEqual(lengthsOf([1, 1], [2, 2], [3, 2]));
  });

  it('cabe os 256 símbolos de 8 bits (contagem 256 é implícita)', () => {
    const lengths = lengthsOf(...Array.from({ length: 256 }, (_, symbol) => [symbol, 8] as const));
    const bytes = serializeCanonicalTable(lengths);
    expect(bytes.length).toBe(2 + 1 + 7 + 256);
    expect(deserializeCanonicalTable(bytes).lengths).toEqual(lengths);
  });

  it('serializa tabela vazia em 2 bytes', () => {
    const bytes = serializeCanonicalTable([]);
    expect([...bytes]).toEqual([0, 0]);
    expect(deserializeCanonicalTable(bytes)).toEqual({ lengths: [], byteLength: 2 });
  });

  it('recusa tabela truncada em qualquer posição', () => {
    const bytes = serializeCanonicalTable(lengthsOf([1, 1], [2, 2], [3, 3], [4, 3]));
    for (let size = 0; size < bytes.length; size++) {
      expect(codeErrorOf(() => deserializeCanonicalTable(bytes.subarray(0, size)))).toBe(
        'TRUNCATED_HEADER',
      );
    }
  });

  it.each([
    ['mais de 256 símbolos', [1, 1, 8]],
    ['Lmax zero', [0, 2, 0]],
    ['contagens maiores que n', [0, 2, 3, 5, 1, 2]],
    ['símbolo repetido', [0, 2, 1, 7, 7]],
    ['grupo fora da ordem canônica', [0, 2, 1, 9, 3]],
    ['código incompleto', [0, 3, 2, 0, 1, 2, 3]],
  ])('recusa %s', (_name, bytes) => {
    expect(codeErrorOf(() => deserializeCanonicalTable(Uint8Array.from(bytes)))).toBe(
      'INVALID_CODE_TABLE',
    );
  });
});

describe('leitor canônico sem árvore', () => {
  it('decodifica os mesmos símbolos que a tabela de códigos', () => {
    const lengths = lengthsOf([65, 2], [66, 1], [67, 3], [68, 3]);
    const table = buildCanonicalCodeTable(lengths);
    const reader = createCanonicalSymbolReader(buildCanonicalDecoder(lengths));
    const decoded: number[] = [];
    for (const symbol of [68, 66, 65, 67, 66]) {
      for (const bit of table[symbol] ?? '') {
        const result = reader.next(bit === '1' ? 1 : 0);
        if (result !== null) decoded.push(result);
      }
    }
    expect(decoded).toEqual([68, 66, 65, 67, 66]);
    expect(reader.atBoundary).toBe(true);
  });

  it('sinaliza código parcial e recusa prefixo inexistente em símbolo isolado', () => {
    const reader = createCanonicalSymbolReader(
      buildCanonicalDecoder(lengthsOf([1, 1], [2, 2], [3, 2])),
    );
    expect(reader.next(1)).toBeNull();
    expect(reader.atBoundary).toBe(false);

    const single = createCanonicalSymbolReader(buildCanonicalDecoder(lengthsOf([7, 1])));
    expect(codeErrorOf(() => single.next(1))).toBe('INVALID_CODE_TABLE');
  });
});
