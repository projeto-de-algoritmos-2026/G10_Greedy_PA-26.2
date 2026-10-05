import { packCodes, readBits, validatePackedBitstream } from './bitstream';
import { buildHuffmanTree } from './buildTree';
import type { CodeLengthTable } from './canonical';
import {
  buildCanonicalCodeTable,
  buildCanonicalDecoder,
  createCanonicalSymbolReader,
  deriveCodeLengths,
  deserializeCanonicalTable,
  serializeCanonicalTable,
} from './canonical';
import { createMetrics, pushUint32 } from './codec';
import { HuffmanCodecError } from './errors';
import type { EncodedHuffmanData, HuffmanNode } from './types';

const MAGIC = Object.freeze([0x48, 0x55, 0x43]); // ASCII: HUC
const FORMAT_VERSION = 1;

/**
 * Cabeçalho canônico v1: "HUC", versão, tamanho original (u32), bits úteis (u32), padding (u8)
 * e a tabela de comprimentos (ver `serializeCanonicalTable`). Não carrega frequências nem a
 * topologia da árvore: os comprimentos bastam para decodificar.
 */
function serializeHeader(
  lengths: CodeLengthTable,
  originalByteLength: number,
  payloadBitLength: number,
  paddingBits: number,
): Uint8Array {
  const bytes: number[] = [...MAGIC, FORMAT_VERSION];
  pushUint32(bytes, originalByteLength);
  pushUint32(bytes, payloadBitLength);
  bytes.push(paddingBits);
  return Uint8Array.from([...bytes, ...serializeCanonicalTable(lengths)]);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    throw new HuffmanCodecError('TRUNCATED_HEADER', 'O cabeçalho terminou antes do esperado.');
  }
  return (
    (bytes[offset] ?? 0) * 0x100_0000 +
    (bytes[offset + 1] ?? 0) * 0x1_0000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

/**
 * Codifica com códigos canônicos derivados dos comprimentos da árvore. O payload tem exatamente
 * o mesmo número de bits que `encode` com a mesma árvore; só o cabeçalho muda de representação.
 */
export function encodeCanonical(data: Uint8Array, tree?: HuffmanNode | null): EncodedHuffmanData {
  const root = tree === undefined ? buildHuffmanTree(data).root : tree;
  const lengths = deriveCodeLengths(root);
  const packed = packCodes(data, buildCanonicalCodeTable(lengths));
  const header = serializeHeader(lengths, data.length, packed.bitLength, packed.paddingBits);

  return Object.freeze({
    header,
    payload: packed.bytes,
    metrics: createMetrics(
      data.length,
      header.length,
      packed.bitLength,
      packed.bytes.length,
      packed.paddingBits,
    ),
  });
}

/** Reconstrói a tabela canônica do cabeçalho e devolve exatamente os bytes originais. */
export function decodeCanonical(
  encoded: Pick<EncodedHuffmanData, 'header' | 'payload'>,
): Uint8Array {
  const { header, payload } = encoded;
  for (const [index, expected] of MAGIC.entries()) {
    if (header[index] !== expected) {
      throw new HuffmanCodecError('INVALID_MAGIC', 'O cabeçalho não começa com a assinatura HUC.');
    }
  }
  const version = header[3];
  if (version !== FORMAT_VERSION) {
    throw new HuffmanCodecError(
      'UNSUPPORTED_VERSION',
      `Versão Huffman canônica ${version ?? 'ausente'} não suportada; esperado ${FORMAT_VERSION}.`,
    );
  }

  const originalByteLength = readUint32(header, 4);
  const payloadBitLength = readUint32(header, 8);
  const paddingBits = header[12];
  if (paddingBits === undefined) {
    throw new HuffmanCodecError('TRUNCATED_HEADER', 'O cabeçalho terminou antes do esperado.');
  }

  const { lengths, byteLength } = deserializeCanonicalTable(header, 13);
  if (13 + byteLength !== header.length) {
    throw new HuffmanCodecError(
      'TRAILING_HEADER_DATA',
      'O cabeçalho contém bytes depois do fim da tabela.',
    );
  }
  if (originalByteLength > 0 && lengths.length === 0) {
    throw new HuffmanCodecError('MISSING_TREE', 'Dados não vazios exigem uma tabela de códigos.');
  }
  if (lengths.length === 0 && payloadBitLength !== 0) {
    throw new HuffmanCodecError('INVALID_HEADER', 'Uma tabela vazia não pode possuir payload.');
  }

  validatePackedBitstream(payload, payloadBitLength, paddingBits);
  if (lengths.length === 0) return new Uint8Array();
  if (originalByteLength > payloadBitLength) {
    throw new HuffmanCodecError(
      'LENGTH_MISMATCH',
      'A quantidade original de bytes é impossível para o número de bits informado.',
    );
  }

  const reader = createCanonicalSymbolReader(buildCanonicalDecoder(lengths));
  const output = new Uint8Array(originalByteLength);
  let outputIndex = 0;

  for (const bit of readBits(payload, payloadBitLength)) {
    const symbol = reader.next(bit);
    if (symbol === null) continue;
    if (outputIndex >= output.length) {
      throw new HuffmanCodecError(
        'EXCESS_DATA',
        'O payload decodifica mais bytes que o declarado.',
      );
    }
    output[outputIndex++] = symbol;
  }

  if (!reader.atBoundary) {
    throw new HuffmanCodecError('INCOMPLETE_CODE', 'O payload termina no meio de um código.');
  }
  if (outputIndex !== originalByteLength) {
    throw new HuffmanCodecError(
      'LENGTH_MISMATCH',
      `Foram decodificados ${outputIndex} bytes; o cabeçalho declara ${originalByteLength}.`,
    );
  }
  return output;
}
