// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isPrefixFree } from '../algorithms/huffman';
import type { HuffmanCodeTable } from '../algorithms/huffman';
import { generateByteCorpus } from '../test/random';
import {
  analyzeLabInput,
  assertLabContainerSize,
  assertLabInputSize,
  formatByteLength,
  LAB_LIMITS,
  LabError,
  restoreLabContainer,
} from './lab';
import type { LabErrorCode } from './lab';

const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text);

function expectLabError(action: () => unknown, code: LabErrorCode): void {
  expect(action).toThrowError(LabError);
  expect(action).toThrowError(expect.objectContaining({ code }));
}

const corpora = [
  { name: 'texto UTF-8', data: encodeText('Transmissão concluída: ação, órbita e telemetria.') },
  { name: 'símbolo único', data: Uint8Array.from({ length: 40 }, () => 7) },
  { name: 'um byte', data: Uint8Array.of(200) },
  {
    name: 'binário com os 256 bytes',
    data: generateByteCorpus({
      alphabet: Array.from({ length: 256 }, (_, symbol) => symbol),
      length: 4096,
      distribution: 'skewed',
      seed: 19,
    }),
  },
  {
    name: 'frequências empatadas',
    data: generateByteCorpus({
      alphabet: [1, 2, 3, 4, 5, 6, 7, 8],
      length: 800,
      distribution: 'tied',
      seed: 20,
    }),
  },
];

describe('analyzeLabInput', () => {
  it.each(corpora)('preserva decode(encode(dados)) === dados para $name', ({ data }) => {
    const analysis = analyzeLabInput(data);

    expect(analysis.restored).toEqual(data);
    expect(restoreLabContainer(analysis.container).restored).toEqual(data);
  });

  it.each(corpora)('deriva frequências e códigos de prefixo para $name', ({ data }) => {
    const { symbols, originalByteLength } = analyzeLabInput(data);
    const table: HuffmanCodeTable = Object.fromEntries(
      symbols.map(({ symbol, code }) => [symbol, code]),
    );

    expect(symbols.reduce((total, { weight }) => total + weight, 0)).toBe(originalByteLength);
    expect(symbols.reduce((total, entry) => total + entry.relativeFrequency, 0)).toBeCloseTo(1);
    expect(new Set(symbols.map(({ symbol }) => symbol)).size).toBe(new Set(data).size);
    expect(isPrefixFree(table)).toBe(true);
    for (let index = 1; index < symbols.length; index++) {
      expect(symbols[index - 1]!.weight).toBeGreaterThanOrEqual(symbols[index]!.weight);
    }
  });

  it.each(corpora)('mantém cabeçalho, padding e taxas coerentes para $name', ({ data }) => {
    const { metrics, header, headerBytes, container, rates, symbols } = analyzeLabInput(data);
    const weightedLength = symbols.reduce(
      (total, { weight, code }) => total + weight * code.length,
      0,
    );

    expect(metrics.payloadBitLength).toBe(weightedLength);
    expect(metrics.payloadBitLength + metrics.paddingBitLength).toBe(metrics.payloadByteLength * 8);
    expect(metrics.paddingBitLength).toBeLessThan(8);
    expect(header.headerByteLength).toBe(headerBytes.length);
    expect(header.originalByteLength).toBe(data.length);
    expect(header.payloadBitLength).toBe(metrics.payloadBitLength);
    expect(header.paddingBits).toBe(metrics.paddingBitLength);
    expect(container).toHaveLength(metrics.totalByteLength);
    expect(metrics.totalByteLength).toBe(metrics.headerByteLength + metrics.payloadByteLength);
    expect(rates.averageCodeLength).toBeCloseTo(weightedLength / data.length);
    expect(rates.effectiveRatio).toBeCloseTo(container.length / data.length);
    expect(rates.effectiveSavingRatio).toBeCloseTo(1 - rates.effectiveRatio);
    expect(rates.expands).toBe(container.length > data.length);
  });

  it('respeita H ≤ comprimento médio < H + 1 quando há mais de um símbolo', () => {
    for (const { data } of corpora) {
      const { rates, symbols } = analyzeLabInput(data);
      if (symbols.length === 1) {
        expect(rates.entropyBitsPerSymbol).toBe(0);
        expect(rates.averageCodeLength).toBe(1);
        continue;
      }
      expect(rates.averageCodeLength).toBeGreaterThanOrEqual(rates.entropyBitsPerSymbol - 1e-9);
      expect(rates.averageCodeLength).toBeLessThan(rates.entropyBitsPerSymbol + 1);
    }
  });

  it('informa quando o cabeçalho torna o arquivo codificado maior que o original', () => {
    const small = analyzeLabInput(encodeText('abc'));
    const large = analyzeLabInput(encodeText('a'.repeat(900) + 'b'.repeat(100)));

    expect(small.rates.expands).toBe(true);
    expect(small.rates.effectiveSavingRatio).toBeLessThan(0);
    expect(small.rates.payloadRatio).toBeLessThan(1);
    expect(large.rates.expands).toBe(false);
    expect(large.rates.effectiveSavingRatio).toBeGreaterThan(0);
  });

  it('rejeita entrada vazia ou acima do limite', () => {
    expectLabError(() => analyzeLabInput(new Uint8Array()), 'EMPTY_INPUT');
    expectLabError(
      () => analyzeLabInput(new Uint8Array(LAB_LIMITS.maxInputByteLength + 1)),
      'INPUT_TOO_LARGE',
    );
    expectLabError(() => assertLabInputSize(0), 'EMPTY_INPUT');
    expect(() => assertLabInputSize(LAB_LIMITS.maxInputByteLength)).not.toThrow();
  });

  it('processa uma entrada no limite de tamanho', () => {
    const data = generateByteCorpus({
      alphabet: Array.from({ length: 64 }, (_, symbol) => symbol * 4),
      length: LAB_LIMITS.maxInputByteLength,
      distribution: 'skewed',
      seed: 21,
    });
    const analysis = analyzeLabInput(data);

    // `toEqual` percorre 1 MiB elemento a elemento com custo alto; a comparação direta basta.
    expect(analysis.restored).toHaveLength(data.length);
    expect(analysis.restored.every((byte, index) => byte === data[index])).toBe(true);
    expect(analysis.container.length).toBeLessThanOrEqual(LAB_LIMITS.maxContainerByteLength);
  });
});

describe('restoreLabContainer', () => {
  it('rejeita arquivos vazios, grandes demais ou que não são .huf', () => {
    expectLabError(() => restoreLabContainer(new Uint8Array()), 'EMPTY_INPUT');
    expectLabError(
      () => assertLabContainerSize(LAB_LIMITS.maxContainerByteLength + 1),
      'CONTAINER_TOO_LARGE',
    );
    expectLabError(() => restoreLabContainer(encodeText('texto comum')), 'INVALID_CONTAINER');
  });

  it('rejeita contêiner corrompido sem devolver dados parciais', () => {
    const { container } = analyzeLabInput(encodeText('abracadabra abracadabra'));

    expectLabError(() => restoreLabContainer(container.slice(0, -1)), 'INVALID_CONTAINER');
    expectLabError(() => restoreLabContainer(container.slice(0, 10)), 'INVALID_CONTAINER');
  });

  it('recusa cabeçalho que declara conteúdo acima do limite antes de decodificar', () => {
    const { container } = analyzeLabInput(encodeText('aaaa'));
    const forged = container.slice();
    // Tamanho original é um u32 big-endian nos bytes 4..7 do cabeçalho v1.
    forged.set([0x7f, 0xff, 0xff, 0xff], 4);

    expectLabError(() => restoreLabContainer(forged), 'RESTORED_TOO_LARGE');
  });
});

describe('formatByteLength', () => {
  it('usa bytes exatos abaixo de 1 KiB e unidades binárias acima', () => {
    expect(formatByteLength(1)).toBe('1 byte');
    expect(formatByteLength(1023)).toBe('1023 bytes');
    expect(formatByteLength(1024)).toBe('1 KiB');
    expect(formatByteLength(1536)).toBe('1.50 KiB');
    expect(formatByteLength(1024 * 1024)).toBe('1 MiB');
  });
});
