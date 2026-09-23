import { packCodes, readBits, validatePackedBitstream } from './bitstream';
import { buildCodeTable } from './buildCodeTable';
import { buildHuffmanTree, validateHuffmanTree } from './buildTree';
import { HuffmanCodecError } from './errors';
import type {
  EncodedHuffmanData,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMetrics,
  HuffmanNode,
} from './types';

const MAGIC = Object.freeze([0x48, 0x55, 0x46]); // ASCII: HUF
const FORMAT_VERSION = 1;
const UINT32_MAX = 0xffff_ffff;

const enum TreeTag {
  Empty = 0,
  Leaf = 1,
  Internal = 2,
}

interface DecodedHeader {
  readonly originalByteLength: number;
  readonly payloadBitLength: number;
  readonly paddingBits: number;
  readonly root: HuffmanNode | null;
}

function pushUint32(target: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new HuffmanCodecError(
      'SIZE_LIMIT_EXCEEDED',
      `O formato suporta valores entre 0 e ${UINT32_MAX}; recebido ${value}.`,
    );
  }
  target.push(
    Math.floor(value / 0x100_0000) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function serializeTree(node: HuffmanNode | null, target: number[]): void {
  if (node === null) {
    target.push(TreeTag.Empty);
    return;
  }
  if (node.kind === 'leaf') {
    target.push(TreeTag.Leaf, node.symbol);
    pushUint32(target, node.weight);
    return;
  }
  target.push(TreeTag.Internal);
  serializeTree(node.left, target);
  serializeTree(node.right, target);
}

/**
 * Cabeçalho v1: "HUF", versão, tamanho original (u32), bits úteis (u32), padding (u8) e
 * árvore em pré-ordem. Tags da árvore: 0=vazia, 1=folha seguida de símbolo e peso, 2=ramo.
 */
function serializeHeader(
  root: HuffmanNode | null,
  originalByteLength: number,
  payloadBitLength: number,
  paddingBits: number,
): Uint8Array {
  validateHuffmanTree(root);
  const bytes: number[] = [...MAGIC, FORMAT_VERSION];
  pushUint32(bytes, originalByteLength);
  pushUint32(bytes, payloadBitLength);
  bytes.push(paddingBits);
  serializeTree(root, bytes);
  return Uint8Array.from(bytes);
}

class HeaderReader {
  private offset = 0;
  private branchIndex = 0;
  private readonly symbols = new Set<number>();

  constructor(private readonly header: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  readByte(): number {
    const value = this.header[this.offset];
    if (value === undefined) {
      throw new HuffmanCodecError('TRUNCATED_HEADER', 'O cabeçalho terminou antes do esperado.');
    }
    this.offset += 1;
    return value;
  }

  readUint32(): number {
    const first = this.readByte();
    const second = this.readByte();
    const third = this.readByte();
    const fourth = this.readByte();
    return first * 0x100_0000 + second * 0x1_0000 + third * 0x100 + fourth;
  }

  readTree(allowEmpty = true, depth = 0): HuffmanNode | null {
    if (depth > 255) {
      throw new HuffmanCodecError('INVALID_TREE', 'A profundidade da árvore excede o alfabeto.');
    }

    const tag = this.readByte();
    if (tag === TreeTag.Empty) {
      if (!allowEmpty) {
        throw new HuffmanCodecError('INVALID_TREE', 'Um ramo interno não pode ter filho vazio.');
      }
      return null;
    }

    if (tag === TreeTag.Leaf) {
      const symbol = this.readByte();
      const weight = this.readUint32();
      if (weight === 0) {
        throw new HuffmanCodecError('INVALID_TREE', `A folha ${symbol} possui peso zero.`);
      }
      if (this.symbols.has(symbol)) {
        throw new HuffmanCodecError('INVALID_TREE', `O símbolo ${symbol} aparece mais de uma vez.`);
      }
      this.symbols.add(symbol);
      return Object.freeze({
        kind: 'leaf',
        id: `header-leaf-${symbol}`,
        symbol,
        weight,
      }) satisfies HuffmanLeaf;
    }

    if (tag === TreeTag.Internal) {
      const left = this.readTree(false, depth + 1);
      const right = this.readTree(false, depth + 1);
      if (left === null || right === null) {
        throw new HuffmanCodecError('INVALID_TREE', 'Ramo interno incompleto.');
      }
      const node = Object.freeze({
        kind: 'internal',
        id: `header-branch-${this.branchIndex++}`,
        weight: left.weight + right.weight,
        left,
        right,
      }) satisfies HuffmanInternalNode;
      return node;
    }

    throw new HuffmanCodecError('INVALID_TREE', `Tag de árvore desconhecida: ${tag}.`);
  }
}

function parseHeader(header: Uint8Array): DecodedHeader {
  const reader = new HeaderReader(header);
  for (const expected of MAGIC) {
    if (reader.readByte() !== expected) {
      throw new HuffmanCodecError('INVALID_MAGIC', 'O cabeçalho não começa com a assinatura HUF.');
    }
  }

  const version = reader.readByte();
  if (version !== FORMAT_VERSION) {
    throw new HuffmanCodecError(
      'UNSUPPORTED_VERSION',
      `Versão Huffman ${version} não suportada; esperado ${FORMAT_VERSION}.`,
    );
  }

  const originalByteLength = reader.readUint32();
  const payloadBitLength = reader.readUint32();
  const paddingBits = reader.readByte();
  const root = reader.readTree();

  if (reader.position !== header.length) {
    throw new HuffmanCodecError(
      'TRAILING_HEADER_DATA',
      'O cabeçalho contém bytes depois do fim da árvore.',
    );
  }
  if (originalByteLength > 0 && root === null) {
    throw new HuffmanCodecError('MISSING_TREE', 'Dados não vazios exigem uma árvore de Huffman.');
  }
  if (root === null && payloadBitLength !== 0) {
    throw new HuffmanCodecError('INVALID_HEADER', 'Uma árvore vazia não pode possuir payload.');
  }

  return Object.freeze({ originalByteLength, payloadBitLength, paddingBits, root });
}

function createMetrics(
  originalByteLength: number,
  headerByteLength: number,
  payloadBitLength: number,
  payloadByteLength: number,
  paddingBitLength: number,
): HuffmanMetrics {
  const totalByteLength = headerByteLength + payloadByteLength;
  return Object.freeze({
    originalByteLength,
    headerByteLength,
    payloadBitLength,
    payloadByteLength,
    paddingBitLength,
    totalByteLength,
    totalBitLength: totalByteLength * 8,
  });
}

/**
 * Codifica bytes em um payload real. Uma árvore opcional permite reutilizar a árvore global da
 * missão ou uma árvore válida construída manualmente pelo jogador.
 */
export function encode(data: Uint8Array, tree?: HuffmanNode | null): EncodedHuffmanData {
  const root = tree === undefined ? buildHuffmanTree(data).root : tree;
  const codeTable = buildCodeTable(root);
  const packed = packCodes(data, codeTable);
  const header = serializeHeader(root, data.length, packed.bitLength, packed.paddingBits);
  const metrics = createMetrics(
    data.length,
    header.length,
    packed.bitLength,
    packed.bytes.length,
    packed.paddingBits,
  );

  return Object.freeze({ header, payload: packed.bytes, metrics });
}

/** Reconstrói a árvore serializada e devolve exatamente os bytes originais. */
export function decode(encoded: Pick<EncodedHuffmanData, 'header' | 'payload'>): Uint8Array {
  const { originalByteLength, payloadBitLength, paddingBits, root } = parseHeader(encoded.header);
  validatePackedBitstream(encoded.payload, payloadBitLength, paddingBits);

  if (root === null) return new Uint8Array();
  if (originalByteLength > payloadBitLength) {
    throw new HuffmanCodecError(
      'LENGTH_MISMATCH',
      'A quantidade original de bytes é impossível para o número de bits informado.',
    );
  }

  const output = new Uint8Array(originalByteLength);
  let outputIndex = 0;

  if (root.kind === 'leaf') {
    for (const bit of readBits(encoded.payload, payloadBitLength)) {
      if (bit !== 0) {
        throw new HuffmanCodecError('INVALID_TREE', 'O código de uma árvore unitária deve ser 0.');
      }
      if (outputIndex >= output.length) {
        throw new HuffmanCodecError(
          'EXCESS_DATA',
          'O payload decodifica mais bytes que o declarado.',
        );
      }
      output[outputIndex++] = root.symbol;
    }
  } else {
    let current: HuffmanNode = root;
    for (const bit of readBits(encoded.payload, payloadBitLength)) {
      if (current.kind !== 'internal') {
        throw new HuffmanCodecError(
          'INVALID_TREE',
          'Estado inválido durante a travessia da árvore.',
        );
      }
      current = bit === 0 ? current.left : current.right;
      if (current.kind === 'leaf') {
        if (outputIndex >= output.length) {
          throw new HuffmanCodecError(
            'EXCESS_DATA',
            'O payload decodifica mais bytes que o declarado.',
          );
        }
        output[outputIndex++] = current.symbol;
        current = root;
      }
    }
    if (current !== root) {
      throw new HuffmanCodecError('INCOMPLETE_CODE', 'O payload termina no meio de um código.');
    }
  }

  if (outputIndex !== originalByteLength) {
    throw new HuffmanCodecError(
      'LENGTH_MISMATCH',
      `Foram decodificados ${outputIndex} bytes; o cabeçalho declara ${originalByteLength}.`,
    );
  }
  return output;
}
