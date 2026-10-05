// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { generateByteCorpus } from '../../test/random';
import type { ByteDistribution } from '../../test/random';
import { buildHuffmanTree, buildHuffmanTreeFromFrequencies } from './buildTree';
import { decode, encode } from './codec';
import { decodeCanonical, encodeCanonical } from './canonicalCodec';
import type { HuffmanCodecErrorCode } from './errors';
import { HuffmanCodecError } from './errors';
import type { EncodedHuffmanData, HuffmanLeaf, HuffmanNode } from './types';

const FIXED_HEADER = 13;

const errorCodeOf = (action: () => unknown): HuffmanCodecErrorCode | undefined => {
  try {
    action();
  } catch (error) {
    if (error instanceof HuffmanCodecError) return error.code;
    throw error;
  }
  return undefined;
};

const withHeader = (encoded: EncodedHuffmanData, edit: (header: Uint8Array) => void) => {
  const header = Uint8Array.from(encoded.header);
  edit(header);
  return { header, payload: encoded.payload };
};

const cases: readonly {
  readonly name: string;
  readonly alphabet: readonly number[];
  readonly length: number;
  readonly distribution: ByteDistribution;
  readonly seed: number;
}[] = [
  { name: 'binário', alphabet: [0, 255], length: 257, distribution: 'uniform', seed: 201 },
  {
    name: 'esparso',
    alphabet: [3, 17, 99, 200, 255],
    length: 513,
    distribution: 'uniform',
    seed: 202,
  },
  {
    name: 'empatado',
    alphabet: Array.from({ length: 16 }, (_, index) => index * 17),
    length: 1024,
    distribution: 'tied',
    seed: 203,
  },
  {
    name: 'enviesado',
    alphabet: [0, 1, 2, 3, 127, 254],
    length: 2048,
    distribution: 'skewed',
    seed: 204,
  },
  {
    name: 'alfabeto completo',
    alphabet: Array.from({ length: 256 }, (_, symbol) => symbol),
    length: 4096,
    distribution: 'skewed',
    seed: 205,
  },
];

describe('encodeCanonical / decodeCanonical', () => {
  it.each(cases)('restaura exatamente os bytes: $name', (testCase) => {
    const data = generateByteCorpus(testCase);
    expect(decodeCanonical(encodeCanonical(data))).toEqual(data);
  });

  it.each(cases)('mantém o payload idêntico ao da árvore explícita: $name', (testCase) => {
    const data = generateByteCorpus(testCase);
    const tree = encode(data);
    const canonical = encodeCanonical(data);

    // Mesmos comprimentos de código ⇒ mesmo número de bits, de bytes e de padding.
    expect(canonical.metrics.payloadBitLength).toBe(tree.metrics.payloadBitLength);
    expect(canonical.metrics.payloadByteLength).toBe(tree.metrics.payloadByteLength);
    expect(canonical.metrics.paddingBitLength).toBe(tree.metrics.paddingBitLength);
    expect(canonical.payload.length).toBe(tree.payload.length);
  });

  it.each(cases)(
    'cabeçalho canônico é menor que a árvore para alfabetos grandes: $name',
    (testCase) => {
      const data = generateByteCorpus(testCase);
      const symbols = new Set(data).size;
      const tree = encode(data).metrics.headerByteLength;
      const canonical = encodeCanonical(data).metrics.headerByteLength;
      if (symbols >= 2) expect(canonical).toBeLessThan(tree);
    },
  );

  it('calcula o tamanho do cabeçalho pela fórmula 16 + (Lmax − 1) + n', () => {
    const data = Uint8Array.from([1, 1, 1, 1, 2, 2, 3, 4]);
    const { metrics } = encodeCanonical(data);
    // n = 4, comprimentos 1,2,3,3 ⇒ Lmax = 3: 13 fixos + 2 (n) + 1 (Lmax) + 2 contagens + 4 símbolos.
    expect(metrics.headerByteLength).toBe(FIXED_HEADER + 2 + 1 + 2 + 4);
  });

  it('trata entrada vazia, símbolo único e árvore fornecida', () => {
    expect(decodeCanonical(encodeCanonical(new Uint8Array()))).toEqual(new Uint8Array());

    const single = new Uint8Array(100).fill(0x7f);
    const encodedSingle = encodeCanonical(single);
    expect(encodedSingle.metrics.payloadBitLength).toBe(100);
    expect(decodeCanonical(encodedSingle)).toEqual(single);

    // Árvore alternativa e válida (frequências diferentes das reais) continua decodificável.
    const data = Uint8Array.from([1, 2, 2, 3, 3, 3]);
    const { root } = buildHuffmanTreeFromFrequencies([
      { symbol: 1, weight: 9 },
      { symbol: 2, weight: 2 },
      { symbol: 3, weight: 1 },
    ]);
    expect(decodeCanonical(encodeCanonical(data, root))).toEqual(data);
  });

  it('decodifica árvore degenerada de 255 bits de profundidade', () => {
    // Cadeia manual: cada nó interno anexa uma folha, sem seguir Huffman.
    let node: HuffmanNode = { kind: 'leaf', id: 'leaf-0', symbol: 0, weight: 1 };
    for (let symbol = 1; symbol < 256; symbol++) {
      const leaf: HuffmanLeaf = { kind: 'leaf', id: `leaf-${symbol}`, symbol, weight: 1 };
      node = {
        kind: 'internal',
        id: `branch-${symbol}`,
        weight: node.weight + 1,
        left: node,
        right: leaf,
      };
    }
    const data = Uint8Array.from([0, 255, 1, 254, 0, 128]);
    const encoded = encodeCanonical(data, node);
    // Profundidades: símbolo 0 → 255, 255 → 1, 1 → 255, 254 → 2, 128 → 128.
    expect(encoded.metrics.payloadBitLength).toBe(255 + 1 + 255 + 2 + 255 + 128);
    expect(decodeCanonical(encoded)).toEqual(data);
  });

  it('rejeita assinatura, versão e cabeçalho truncado', () => {
    const encoded = encodeCanonical(Uint8Array.from([1, 2, 2, 3, 3, 3]));
    expect(errorCodeOf(() => decodeCanonical(withHeader(encoded, (h) => (h[0] = 0))))).toBe(
      'INVALID_MAGIC',
    );
    expect(errorCodeOf(() => decodeCanonical(withHeader(encoded, (h) => (h[3] = 9))))).toBe(
      'UNSUPPORTED_VERSION',
    );
    // O cabeçalho do codec com árvore (HUF) não é um cabeçalho canônico.
    expect(errorCodeOf(() => decodeCanonical(encode(Uint8Array.from([1, 2]))))).toBe(
      'INVALID_MAGIC',
    );
    for (let size = 0; size < encoded.header.length; size++) {
      const code = errorCodeOf(() =>
        decodeCanonical({ header: encoded.header.slice(0, size), payload: encoded.payload }),
      );
      expect(code, `cabeçalho de ${size} bytes`).toBeDefined();
    }
  });

  it('rejeita bytes depois da tabela', () => {
    const encoded = encodeCanonical(Uint8Array.from([1, 2, 2, 3, 3, 3]));
    const header = Uint8Array.from([...encoded.header, 0]);
    expect(errorCodeOf(() => decodeCanonical({ header, payload: encoded.payload }))).toBe(
      'TRAILING_HEADER_DATA',
    );
  });

  it('rejeita payload inconsistente com o cabeçalho', () => {
    const data = generateByteCorpus({
      alphabet: [0, 1, 2, 3, 4],
      length: 300,
      distribution: 'skewed',
      seed: 301,
    });
    const encoded = encodeCanonical(data);

    expect(
      errorCodeOf(() => decodeCanonical({ ...encoded, payload: encoded.payload.slice(1) })),
    ).toBe('PAYLOAD_LENGTH_MISMATCH');
    expect(
      errorCodeOf(() => decodeCanonical(withHeader(encoded, (h) => (h[12] = (h[12] ?? 0) ^ 1)))),
    ).toBe('INVALID_PADDING');
    // Tamanho original menor que o decodificado ⇒ sobra de dados.
    expect(
      errorCodeOf(() => decodeCanonical(withHeader(encoded, (h) => (h[7] = (h[7] ?? 0) - 1)))),
    ).toBe('EXCESS_DATA');
    // Tamanho original maior ⇒ faltam símbolos.
    expect(
      errorCodeOf(() => decodeCanonical(withHeader(encoded, (h) => (h[7] = (h[7] ?? 0) + 1)))),
    ).toBe('LENGTH_MISMATCH');
  });

  it('rejeita payload que termina no meio de um código', () => {
    // Códigos 0, 10, 11: o bit final "1" isolado deixa um prefixo aberto.
    const encoded = encodeCanonical(Uint8Array.from([1, 1, 1, 2, 3]));
    const header = Uint8Array.from(encoded.header);
    header[11] = (header[11] ?? 0) + 1; // bits úteis + 1
    header[12] = (header[12] ?? 0) - 1; // padding − 1
    const payload = Uint8Array.from(encoded.payload);
    payload[payload.length - 1] = (payload[payload.length - 1] ?? 0) | (1 << (header[12] ?? 0));
    expect(errorCodeOf(() => decodeCanonical({ header, payload }))).toBe('INCOMPLETE_CODE');
  });

  it('exige tabela para dados não vazios e proíbe payload com tabela vazia', () => {
    const empty = encodeCanonical(new Uint8Array());
    expect(errorCodeOf(() => decodeCanonical(withHeader(empty, (h) => (h[7] = 1))))).toBe(
      'MISSING_TREE',
    );
    expect(errorCodeOf(() => decodeCanonical(withHeader(empty, (h) => (h[11] = 8))))).toBe(
      'INVALID_HEADER',
    );
  });

  it('é determinístico e usa a mesma árvore de referência', () => {
    const data = generateByteCorpus({
      alphabet: Array.from({ length: 40 }, (_, index) => index * 3),
      length: 1500,
      distribution: 'uniform',
      seed: 401,
    });
    const first = encodeCanonical(data);
    const second = encodeCanonical(data, buildHuffmanTree(data).root);
    expect(first.header).toEqual(second.header);
    expect(first.payload).toEqual(second.payload);
    expect(decode(encode(data))).toEqual(decodeCanonical(first));
  });
});
