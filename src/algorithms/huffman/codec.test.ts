import { describe, expect, it } from 'vitest';
import { buildHuffmanTree } from './buildTree';
import { decode, encode } from './codec';
import { InvalidHuffmanTreeError } from './errors';
import type { HuffmanCodecErrorCode } from './errors';
import type { EncodedHuffmanData, HuffmanInternalNode, HuffmanLeaf } from './types';

const HEADER_PAYLOAD_BITS_LAST_BYTE = 11;
const HEADER_PADDING_OFFSET = 12;
const HEADER_TREE_OFFSET = 13;

interface MutableEncodedData {
  header: Uint8Array;
  payload: Uint8Array;
  metrics: EncodedHuffmanData['metrics'];
}

function cloneEncoded(encoded: EncodedHuffmanData): MutableEncodedData {
  return {
    header: encoded.header.slice(),
    payload: encoded.payload.slice(),
    metrics: encoded.metrics,
  };
}

function expectCodecError(action: () => unknown, code: HuffmanCodecErrorCode): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

function manualThreeSymbolTree(): HuffmanInternalNode {
  const leaf = (symbol: number): HuffmanLeaf =>
    Object.freeze({ kind: 'leaf', id: `leaf-${symbol}`, symbol, weight: 1 });
  const right = Object.freeze({
    kind: 'internal',
    id: 'right',
    weight: 2,
    left: leaf(1),
    right: leaf(2),
  }) satisfies HuffmanInternalNode;
  return Object.freeze({
    kind: 'internal',
    id: 'root',
    weight: 3,
    left: leaf(0),
    right,
  });
}

describe('codec Huffman', () => {
  it('realiza round-trip e apresenta métricas sem contar padding duas vezes', () => {
    const data = Uint8Array.from([66, 65, 78, 65, 78, 65]);
    const encoded = encode(data);

    expect(encoded.header).toBeInstanceOf(Uint8Array);
    expect(encoded.payload).toBeInstanceOf(Uint8Array);
    expect(decode(encoded)).toEqual(data);
    expect(encoded.metrics.originalByteLength).toBe(data.length);
    expect(encoded.metrics.headerByteLength).toBe(encoded.header.length);
    expect(encoded.metrics.payloadByteLength).toBe(encoded.payload.length);
    expect(encoded.metrics.totalByteLength).toBe(encoded.header.length + encoded.payload.length);
    expect(encoded.metrics.totalBitLength).toBe(
      encoded.header.length * 8 +
        encoded.metrics.payloadBitLength +
        encoded.metrics.paddingBitLength,
    );
  });

  it('define round-trip para entrada vazia', () => {
    const encoded = encode(new Uint8Array());

    expect(encoded.payload).toEqual(new Uint8Array());
    expect(encoded.metrics.payloadBitLength).toBe(0);
    expect(encoded.metrics.paddingBitLength).toBe(0);
    expect(decode(encoded)).toEqual(new Uint8Array());
  });

  it('define round-trip para alfabeto unitário usando um bit por símbolo', () => {
    const data = Uint8Array.from({ length: 13 }, () => 42);
    const encoded = encode(data);

    expect(encoded.metrics.payloadBitLength).toBe(13);
    expect(encoded.metrics.payloadByteLength).toBe(2);
    expect(encoded.metrics.paddingBitLength).toBe(3);
    expect(decode(encoded)).toEqual(data);
  });

  it('preserva todos os 256 valores possíveis de byte', () => {
    const data = Uint8Array.from({ length: 256 }, (_, symbol) => symbol);

    expect(decode(encode(data))).toEqual(data);
  });

  it('mantém o round-trip em sequências pseudoaleatórias reproduzíveis', () => {
    let state = 0x1234_5678;
    const randomByte = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state & 0xff;
    };

    for (const length of [1, 2, 7, 64, 513]) {
      const data = Uint8Array.from({ length }, randomByte);
      expect(decode(encode(data))).toEqual(data);
    }
  });

  it('aceita uma árvore compartilhada construída para um buffer maior', () => {
    const corpus = Uint8Array.of(0, 0, 0, 1, 1, 2);
    const root = buildHuffmanTree(corpus).root;
    const packet = Uint8Array.of(2, 0, 1, 0);

    expect(decode(encode(packet, root))).toEqual(packet);
  });

  it('reporta assinatura, versão, truncamento e árvore inválidos', () => {
    const encoded = encode(Uint8Array.of(0, 1, 0));

    const badMagic = cloneEncoded(encoded);
    badMagic.header[0] = 0;
    expectCodecError(() => decode(badMagic), 'INVALID_MAGIC');

    const badVersion = cloneEncoded(encoded);
    badVersion.header[3] = 99;
    expectCodecError(() => decode(badVersion), 'UNSUPPORTED_VERSION');

    const truncated = cloneEncoded(encoded);
    truncated.header = truncated.header.slice(0, 5);
    expectCodecError(() => decode(truncated), 'TRUNCATED_HEADER');

    const badTree = cloneEncoded(encoded);
    badTree.header[HEADER_TREE_OFFSET] = 255;
    expectCodecError(() => decode(badTree), 'INVALID_TREE');
  });

  it('reporta payload ausente, padding inconsistente e bits de padding alterados', () => {
    const encoded = encode(Uint8Array.of(9, 9, 9));

    const missingPayload = cloneEncoded(encoded);
    missingPayload.payload = new Uint8Array();
    expectCodecError(() => decode(missingPayload), 'PAYLOAD_LENGTH_MISMATCH');

    const badPadding = cloneEncoded(encoded);
    badPadding.header[HEADER_PADDING_OFFSET] = 0;
    expectCodecError(() => decode(badPadding), 'INVALID_PADDING');

    const changedPaddingBits = cloneEncoded(encoded);
    changedPaddingBits.payload[0] = 1;
    expectCodecError(() => decode(changedPaddingBits), 'INVALID_PADDING_BITS');
  });

  it('reporta códigos incompletos e conteúdo incompatível com árvore unitária', () => {
    const incomplete = cloneEncoded(encode(Uint8Array.of(1), manualThreeSymbolTree()));
    incomplete.header[HEADER_PAYLOAD_BITS_LAST_BYTE] = 1;
    incomplete.header[HEADER_PADDING_OFFSET] = 7;
    expectCodecError(() => decode(incomplete), 'INCOMPLETE_CODE');

    const invalidSingleton = cloneEncoded(encode(Uint8Array.of(7, 7, 7)));
    invalidSingleton.payload[0] = 0b1000_0000;
    expectCodecError(() => decode(invalidSingleton), 'INVALID_TREE');
  });

  it('rejeita árvore sem o símbolo solicitado ou com pesos inconsistentes', () => {
    const onlyZero = Object.freeze({
      kind: 'leaf',
      id: 'zero',
      symbol: 0,
      weight: 1,
    }) satisfies HuffmanLeaf;
    expectCodecError(() => encode(Uint8Array.of(1), onlyZero), 'MISSING_CODE');

    const valid = manualThreeSymbolTree();
    const invalid = Object.freeze({ ...valid, weight: valid.weight + 1 });
    expect(() => encode(Uint8Array.of(0), invalid)).toThrow(InvalidHuffmanTreeError);
  });
});
