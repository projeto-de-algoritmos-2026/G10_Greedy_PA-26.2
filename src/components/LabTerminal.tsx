import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { HuffmanHeaderFields } from '../algorithms/huffman';
import {
  analyzeLabInput,
  assertLabContainerSize,
  assertLabInputSize,
  formatByteLength,
  LAB_LIMITS,
  LabError,
  restoreLabContainer,
} from '../domain';
import type { LabAnalysis, LabRestoration } from '../domain';
import { downloadBytes } from '../infra/download';
import { readFileBytes } from '../infra/readFile';
import { describeByte, formatByteHex, formatNumber, formatPercent } from './format';
import { HuffmanTree } from './HuffmanTree';

/** Acima disto a tabela começa recolhida e o diagrama da árvore deixa de ser legível. */
const INITIAL_SYMBOL_ROWS = 16;
const MAX_DIAGRAM_LEAVES = 16;
const HEADER_PREVIEW_BYTES = 64;
const CONTAINER_EXTENSION = '.huf';
const BINARY_MIME_TYPE = 'application/octet-stream';

type LabResult =
  | { readonly kind: 'analysis'; readonly sourceName: string; readonly analysis: LabAnalysis }
  | {
      readonly kind: 'restoration';
      readonly sourceName: string;
      readonly restoration: LabRestoration;
    };

/** Devolve o controle ao navegador para que o aviso de processamento seja pintado. */
const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function errorMessage(error: unknown): string {
  if (error instanceof LabError) return error.message;
  return 'Não foi possível processar a entrada. Se for um arquivo, tente selecioná-lo novamente.';
}

function restoredFileName(containerName: string): string {
  return containerName.toLowerCase().endsWith(CONTAINER_EXTENSION) &&
    containerName.length > CONTAINER_EXTENSION.length
    ? containerName.slice(0, -CONTAINER_EXTENSION.length)
    : `${containerName}.restaurado`;
}

function hexPreview(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, HEADER_PREVIEW_BYTES), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function HeaderTable({ header }: { readonly header: HuffmanHeaderFields }) {
  return (
    <table>
      <caption>Campos do cabeçalho v{header.formatVersion}</caption>
      <thead>
        <tr>
          <th scope="col">Campo</th>
          <th scope="col">Tamanho</th>
          <th scope="col">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Assinatura</th>
          <td>3 bytes</td>
          <td>HUF</td>
        </tr>
        <tr>
          <th scope="row">Versão</th>
          <td>1 byte</td>
          <td>{header.formatVersion}</td>
        </tr>
        <tr>
          <th scope="row">Tamanho original</th>
          <td>4 bytes</td>
          <td>{header.originalByteLength} bytes</td>
        </tr>
        <tr>
          <th scope="row">Bits úteis</th>
          <td>4 bytes</td>
          <td>{header.payloadBitLength} bits</td>
        </tr>
        <tr>
          <th scope="row">Padding</th>
          <td>1 byte</td>
          <td>{header.paddingBits} bits</td>
        </tr>
        <tr>
          <th scope="row">Árvore em pré-ordem</th>
          <td>{header.treeByteLength} bytes</td>
          <td>frequências e topologia</td>
        </tr>
        <tr>
          <th scope="row">Cabeçalho completo</th>
          <td>{header.headerByteLength} bytes</td>
          <td>{header.headerByteLength * 8} bits</td>
        </tr>
      </tbody>
    </table>
  );
}

function AnalysisReport({
  sourceName,
  analysis,
}: {
  readonly sourceName: string;
  readonly analysis: LabAnalysis;
}) {
  const [showAllSymbols, setShowAllSymbols] = useState(false);
  const { metrics, rates, symbols, header } = analysis;
  const visibleSymbols = showAllSymbols ? symbols : symbols.slice(0, INITIAL_SYMBOL_ROWS);
  const alphabet = symbols.map(({ symbol }) => ({
    value: symbol,
    label: `byte ${formatByteHex(symbol)} (${describeByte(symbol)})`,
  }));

  return (
    <section aria-labelledby="lab-result-title">
      <h3 id="lab-result-title">Análise de {sourceName}</h3>
      <p role="status" className="result-ok">
        ✔ Round-trip verificado: decode(encode(dados)) reproduziu os {analysis.originalByteLength}{' '}
        bytes originais.
      </p>

      <table>
        <caption>Tamanhos e taxa efetiva</caption>
        <thead>
          <tr>
            <th scope="col">Parte</th>
            <th scope="col">Bytes</th>
            <th scope="col">Bits</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Original</th>
            <td>{metrics.originalByteLength}</td>
            <td>{metrics.originalByteLength * 8}</td>
          </tr>
          <tr>
            <th scope="row">Cabeçalho</th>
            <td>{metrics.headerByteLength}</td>
            <td>{metrics.headerByteLength * 8}</td>
          </tr>
          <tr>
            <th scope="row">Payload (bits úteis)</th>
            <td>—</td>
            <td>{metrics.payloadBitLength}</td>
          </tr>
          <tr>
            <th scope="row">Padding do último byte</th>
            <td>—</td>
            <td>{metrics.paddingBitLength}</td>
          </tr>
          <tr>
            <th scope="row">Payload armazenado</th>
            <td>{metrics.payloadByteLength}</td>
            <td>{metrics.payloadByteLength * 8}</td>
          </tr>
          <tr>
            <th scope="row">Total codificado</th>
            <td>{metrics.totalByteLength}</td>
            <td>{metrics.totalBitLength}</td>
          </tr>
        </tbody>
      </table>
      <dl className="lab-rates">
        <div>
          <dt>Taxa efetiva (total ÷ original)</dt>
          <dd>{formatPercent(rates.effectiveRatio)}</dd>
        </div>
        <div>
          <dt>Economia efetiva</dt>
          <dd>{formatPercent(rates.effectiveSavingRatio)}</dd>
        </div>
        <div>
          <dt>Taxa teórica, sem cabeçalho nem padding</dt>
          <dd>{formatPercent(rates.payloadRatio)}</dd>
        </div>
        <div>
          <dt>Comprimento médio do código</dt>
          <dd>{formatNumber(rates.averageCodeLength)} bits por byte</dd>
        </div>
        <div>
          <dt>Entropia da entrada</dt>
          <dd>{formatNumber(rates.entropyBitsPerSymbol)} bits por byte</dd>
        </div>
      </dl>
      {rates.expands && (
        <p className="result-warn">
          ⚠ O arquivo codificado ficou maior que o original: os {metrics.headerByteLength} bytes do
          cabeçalho superam o que o payload economiza. Huffman continua ótimo entre os códigos de
          prefixo; o custo está em transmitir a árvore.
        </p>
      )}

      <div className="lab-actions">
        <button
          type="button"
          className="primary"
          onClick={() =>
            downloadBytes(
              analysis.container,
              `${sourceName}${CONTAINER_EXTENSION}`,
              BINARY_MIME_TYPE,
            )
          }
        >
          Baixar codificado ({CONTAINER_EXTENSION})
        </button>
        <button
          type="button"
          onClick={() =>
            downloadBytes(analysis.restored, `restaurado-${sourceName}`, BINARY_MIME_TYPE)
          }
        >
          Baixar restaurado
        </button>
      </div>

      <h3>Cabeçalho</h3>
      <HeaderTable header={header} />
      <details className="tree-text">
        <summary>Bytes do cabeçalho em hexadecimal</summary>
        <p className="bit-code lab-hex">{hexPreview(analysis.headerBytes)}</p>
        {analysis.headerBytes.length > HEADER_PREVIEW_BYTES && (
          <p>
            Exibindo os primeiros {HEADER_PREVIEW_BYTES} de {analysis.headerBytes.length} bytes.
          </p>
        )}
      </details>

      <h3>Frequências e códigos</h3>
      <table>
        <caption>
          {visibleSymbols.length} de {symbols.length} símbolos, do mais frequente ao menos frequente
        </caption>
        <thead>
          <tr>
            <th scope="col">Byte</th>
            <th scope="col">Caractere</th>
            <th scope="col">Frequência</th>
            <th scope="col">Proporção</th>
            <th scope="col">Código</th>
            <th scope="col">Bits</th>
          </tr>
        </thead>
        <tbody>
          {visibleSymbols.map(({ symbol, weight, relativeFrequency, code }) => (
            <tr key={symbol}>
              <th scope="row">{formatByteHex(symbol)}</th>
              <td>{describeByte(symbol)}</td>
              <td>{weight}</td>
              <td>{formatPercent(relativeFrequency)}</td>
              <td className="bit-code">{code}</td>
              <td>{code.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {symbols.length > INITIAL_SYMBOL_ROWS && (
        <button type="button" onClick={() => setShowAllSymbols((current) => !current)}>
          {showAllSymbols
            ? `Mostrar apenas os ${INITIAL_SYMBOL_ROWS} mais frequentes`
            : `Mostrar todos os ${symbols.length} símbolos`}
        </button>
      )}

      <HuffmanTree
        root={analysis.tree}
        title={`Árvore de Huffman da entrada (${analysis.mergeHistory.length} fusões)`}
        alphabet={alphabet}
        formatSymbol={(symbol) => formatByteHex(symbol).slice(2)}
        maxDiagramLeaves={MAX_DIAGRAM_LEAVES}
      />
    </section>
  );
}

function RestorationReport({
  sourceName,
  restoration,
}: {
  readonly sourceName: string;
  readonly restoration: LabRestoration;
}) {
  const fileName = restoredFileName(sourceName);
  return (
    <section aria-labelledby="lab-result-title">
      <h3 id="lab-result-title">Restauração de {sourceName}</h3>
      <p role="status" className="result-ok">
        ✔ Arquivo decodificado: {restoration.restored.length} bytes restaurados a partir de{' '}
        {restoration.containerByteLength} bytes codificados.
      </p>
      <div className="lab-actions">
        <button
          type="button"
          className="primary"
          onClick={() => downloadBytes(restoration.restored, fileName, BINARY_MIME_TYPE)}
        >
          Baixar restaurado
        </button>
      </div>
      <h3>Cabeçalho</h3>
      <HeaderTable header={restoration.header} />
    </section>
  );
}

/** Aplica o codec a conteúdo do usuário, fora da narrativa. Nada sai do navegador. */
export function LabTerminal() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Uma leitura lenta não pode sobrescrever o resultado de um pedido mais recente.
  const requestRef = useRef(0);
  const textByteLength = new TextEncoder().encode(text).length;

  const run = async (produce: () => Promise<LabResult>) => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await nextTask();
      const produced = await produce();
      if (request === requestRef.current) setResult(produced);
    } catch (failure) {
      if (request === requestRef.current) setError(errorMessage(failure));
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  };

  const analyzeText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => ({
      kind: 'analysis',
      sourceName: 'texto.txt',
      analysis: analyzeLabInput(new TextEncoder().encode(text)),
    }));
  };

  const analyzeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Limpar o campo permite escolher o mesmo arquivo de novo após um erro.
    event.target.value = '';
    if (file === undefined) return;
    void run(async () => {
      // O tamanho informado pelo navegador evita carregar na memória um arquivo que será recusado.
      assertLabInputSize(file.size);
      return {
        kind: 'analysis',
        sourceName: file.name,
        analysis: analyzeLabInput(await readFileBytes(file)),
      };
    });
  };

  const restoreFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    void run(async () => {
      assertLabContainerSize(file.size);
      return {
        kind: 'restoration',
        sourceName: file.name,
        restoration: restoreLabContainer(await readFileBytes(file)),
      };
    });
  };

  return (
    <section className="terminal lab" aria-labelledby="lab-title">
      <p className="terminal-code" aria-hidden="true">
        LAB-01 // CODEC BENCH
      </p>
      <h2 id="lab-title">Laboratório Huffman</h2>
      <p className="assumption">
        O mesmo codec da missão aplicado ao seu conteúdo. Tudo é processado neste navegador: nenhum
        byte é enviado a um servidor. Limite por entrada:{' '}
        {formatByteLength(LAB_LIMITS.maxInputByteLength)}.
      </p>

      <div className="lab-inputs">
        <form onSubmit={analyzeText}>
          <label htmlFor="lab-text">Texto para analisar</label>
          <textarea
            id="lab-text"
            rows={5}
            value={text}
            aria-describedby="lab-text-hint"
            onChange={(event) => setText(event.target.value)}
          />
          <p id="lab-text-hint" className="field-hint">
            Convertido para bytes UTF-8 antes da codificação: {formatByteLength(textByteLength)}.
          </p>
          <button type="submit" className="primary" disabled={busy}>
            Analisar texto
          </button>
        </form>
        <div>
          <label htmlFor="lab-file">Arquivo para analisar</label>
          <input id="lab-file" type="file" disabled={busy} onChange={analyzeFile} />
          <p className="field-hint">Qualquer tipo de arquivo; os bytes são lidos como estão.</p>
          <label htmlFor="lab-container">Arquivo {CONTAINER_EXTENSION} para restaurar</label>
          <input
            id="lab-container"
            type="file"
            accept={CONTAINER_EXTENSION}
            disabled={busy}
            onChange={restoreFile}
          />
          <p className="field-hint">Decodifica um arquivo gerado por este laboratório.</p>
        </div>
      </div>

      {busy && <p role="status">Processando…</p>}
      {error !== null && (
        <p className="system-message system-message-error" role="alert">
          ⚠ {error}
        </p>
      )}
      {result?.kind === 'analysis' && (
        <AnalysisReport sourceName={result.sourceName} analysis={result.analysis} />
      )}
      {result?.kind === 'restoration' && (
        <RestorationReport sourceName={result.sourceName} restoration={result.restoration} />
      )}
    </section>
  );
}
