import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeLabInput, LAB_LIMITS } from '../domain';
import { captureDownloads } from '../test/downloads';
import { generateByteCorpus } from '../test/random';
import { LabTerminal } from './LabTerminal';

const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text);
const SAMPLE_TEXT = 'abracadabra abracadabra';

const rowValues = (name: string | RegExp): readonly string[] =>
  within(screen.getByRole('row', { name }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');

async function analyzeText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('Texto para analisar'), text);
  await user.click(screen.getByRole('button', { name: 'Analisar texto' }));
  await screen.findByRole('heading', { name: 'Análise de texto.txt' });
}

afterEach(() => vi.restoreAllMocks());

describe('LabTerminal', () => {
  it('informa que o processamento é local e qual é o limite', () => {
    render(<LabTerminal />);

    expect(screen.getByText(/nenhum byte é enviado a um servidor/)).toBeVisible();
    expect(screen.getByText(/Limite por entrada: 1 MiB/)).toBeVisible();
  });

  it('analisa um texto e exibe tamanhos, padding e taxa efetiva calculados pelo codec', async () => {
    const user = userEvent.setup();
    const expected = analyzeLabInput(encodeText(SAMPLE_TEXT));
    render(<LabTerminal />);
    await analyzeText(user, SAMPLE_TEXT);

    expect(screen.getByText(/Round-trip verificado/)).toHaveTextContent(
      `reproduziu os ${SAMPLE_TEXT.length} bytes originais`,
    );
    const { metrics } = expected;
    expect(rowValues(/^Original/)).toEqual([
      String(metrics.originalByteLength),
      String(metrics.originalByteLength * 8),
    ]);
    expect(rowValues(/^Payload \(bits úteis\)/)).toEqual(['—', String(metrics.payloadBitLength)]);
    expect(rowValues(/^Padding do último byte/)).toEqual(['—', String(metrics.paddingBitLength)]);
    expect(rowValues(/^Total codificado/)).toEqual([
      String(metrics.totalByteLength),
      String(metrics.totalBitLength),
    ]);
    expect(
      screen.getByText('Taxa efetiva (total ÷ original)').nextElementSibling,
    ).toHaveTextContent(`${(expected.rates.effectiveRatio * 100).toFixed(2)}%`);
    // Texto curto: o cabeçalho pesa mais do que a economia e isso é dito explicitamente.
    expect(expected.rates.expands).toBe(true);
    expect(screen.getByText(/O arquivo codificado ficou maior que o original/)).toBeVisible();
  });

  it('exibe o cabeçalho, as frequências com seus códigos e a árvore', async () => {
    const user = userEvent.setup();
    const expected = analyzeLabInput(encodeText(SAMPLE_TEXT));
    render(<LabTerminal />);
    await analyzeText(user, SAMPLE_TEXT);

    expect(rowValues(/^Assinatura/)).toEqual(['3 bytes', 'HUF']);
    expect(rowValues(/^Tamanho original/)).toEqual(['4 bytes', `${SAMPLE_TEXT.length} bytes`]);
    expect(rowValues(/^Bits úteis/)).toEqual([
      '4 bytes',
      `${expected.metrics.payloadBitLength} bits`,
    ]);
    expect(rowValues(/^Padding 1 byte/)).toEqual([
      '1 byte',
      `${expected.metrics.paddingBitLength} bits`,
    ]);
    expect(rowValues(/^Cabeçalho completo/)).toEqual([
      `${expected.header.headerByteLength} bytes`,
      `${expected.header.headerByteLength * 8} bits`,
    ]);

    const mostFrequent = expected.symbols[0]!;
    expect(String.fromCharCode(mostFrequent.symbol)).toBe('a');
    expect(rowValues(/^0x61/)).toEqual([
      'a',
      String(mostFrequent.weight),
      `${(mostFrequent.relativeFrequency * 100).toFixed(2)}%`,
      mostFrequent.code,
      String(mostFrequent.code.length),
    ]);
    expect(rowValues(/^0x20/)[0]).toBe('espaço');
    expect(screen.getByRole('img', { name: /Árvore de Huffman da entrada/ })).toBeVisible();
    expect(screen.getByText('Alternativa textual da árvore')).toBeVisible();
  });

  it('baixa o conteúdo codificado e o restaurado, e o restaurado é idêntico à entrada', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const expected = analyzeLabInput(encodeText(SAMPLE_TEXT));
    render(<LabTerminal />);
    await analyzeText(user, SAMPLE_TEXT);

    await user.click(screen.getByRole('button', { name: 'Baixar codificado (.huf)' }));
    await user.click(screen.getByRole('button', { name: 'Baixar restaurado' }));
    const [encoded, restored] = await downloads.read();

    expect(encoded?.fileName).toBe('texto.txt.huf');
    expect(encoded?.bytes).toEqual(Array.from(expected.container));
    expect(restored?.fileName).toBe('restaurado-texto.txt');
    expect(restored?.bytes).toEqual(Array.from(encodeText(SAMPLE_TEXT)));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('analisa um arquivo binário lido localmente', async () => {
    const user = userEvent.setup();
    const bytes = generateByteCorpus({
      alphabet: Array.from({ length: 40 }, (_, symbol) => symbol * 6),
      length: 2000,
      distribution: 'skewed',
      seed: 7,
    });
    render(<LabTerminal />);

    await user.upload(
      screen.getByLabelText('Arquivo para analisar'),
      new File([bytes.slice()], 'sensor.bin'),
    );

    expect(await screen.findByRole('heading', { name: 'Análise de sensor.bin' })).toBeVisible();
    expect(rowValues(/^Original/)[0]).toBe('2000');
    // Alfabeto grande: tabela recolhida e árvore apenas em texto.
    expect(screen.queryByRole('img', { name: /Árvore de Huffman/ })).not.toBeInTheDocument();
    expect(screen.getByText(/A árvore possui 40 folhas/)).toBeVisible();
    expect(screen.getAllByRole('row', { name: /^0x/ })).toHaveLength(16);
    await user.click(screen.getByRole('button', { name: 'Mostrar todos os 40 símbolos' }));
    expect(screen.getAllByRole('row', { name: /^0x/ })).toHaveLength(40);
  });

  it('restaura um arquivo .huf e devolve os bytes originais', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const original = encodeText('Telemetria: órbita estável, sinal íntegro.');
    const { container } = analyzeLabInput(original);
    render(<LabTerminal />);

    await user.upload(
      screen.getByLabelText('Arquivo .huf para restaurar'),
      new File([container.slice()], 'relato.txt.huf'),
    );

    expect(
      await screen.findByRole('heading', { name: 'Restauração de relato.txt.huf' }),
    ).toBeVisible();
    expect(screen.getByText(/Arquivo decodificado/)).toHaveTextContent(
      `${original.length} bytes restaurados a partir de ${container.length} bytes codificados`,
    );
    await user.click(screen.getByRole('button', { name: 'Baixar restaurado' }));
    const [restored] = await downloads.read();
    expect(restored?.fileName).toBe('relato.txt');
    expect(restored?.bytes).toEqual(Array.from(original));
  });

  it('explica entradas vazias, grandes demais ou que não são .huf', async () => {
    const user = userEvent.setup();
    render(<LabTerminal />);

    await user.click(screen.getByRole('button', { name: 'Analisar texto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A entrada está vazia');

    await user.upload(
      screen.getByLabelText('Arquivo para analisar'),
      new File([new Uint8Array(LAB_LIMITS.maxInputByteLength + 1)], 'grande.bin'),
    );
    expect(await screen.findByText(/o laboratório aceita até 1 MiB/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Análise de/ })).not.toBeInTheDocument();

    await user.upload(
      screen.getByLabelText('Arquivo .huf para restaurar'),
      new File(['não é um contêiner'], 'falso.huf'),
    );
    expect(await screen.findByText(/Arquivo \.huf inválido/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Baixar restaurado' })).not.toBeInTheDocument();
  });

  it('um erro substitui o resultado anterior em vez de mantê-lo na tela', async () => {
    const user = userEvent.setup();
    render(<LabTerminal />);
    await analyzeText(user, SAMPLE_TEXT);

    await user.clear(screen.getByLabelText('Texto para analisar'));
    await user.click(screen.getByRole('button', { name: 'Analisar texto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A entrada está vazia');
    expect(screen.queryByRole('heading', { name: /Análise de/ })).not.toBeInTheDocument();
  });
});
