import type { MissionReport } from '../domain';
import { formatNumber } from './format';

interface MissionReportTerminalProps {
  readonly report: MissionReport;
  readonly onRestart: () => void;
}

const formatPercent = (ratio: number): string => `${formatNumber(ratio * 100)}%`;

/** Consolida somente valores calculados pelo modelo de relatório da simulação. */
export function MissionReportTerminal({ report, onRestart }: MissionReportTerminalProps) {
  const manual = report.compressed.schedules.manual;
  const edd = report.compressed.schedules.referenceEdd;

  return (
    <section className="terminal mission-report" aria-labelledby="report-title">
      <h2 id="report-title">Relatório da missão</h2>
      <p>
        Transmissão concluída. Os resultados abaixo refletem a árvore e a ordem escolhidas durante
        esta simulação.
      </p>

      <section aria-labelledby="compression-report-title">
        <h3 id="compression-report-title">Original × comprimido</h3>
        <table>
          <caption>Payload e custo efetivo da transmissão</caption>
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              <th scope="col">Original</th>
              <th scope="col">Comprimido</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Payload</th>
              <td>{report.original.transmission.totals.payloadBitLength} bits</td>
              <td>{report.compressed.transmission.totals.payloadBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Cabeçalho</th>
              <td>{report.original.transmission.totals.headerBitLength} bits</td>
              <td>{report.compressed.transmission.totals.headerBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Padding</th>
              <td>{report.original.transmission.totals.paddingBitLength} bits</td>
              <td>{report.compressed.transmission.totals.paddingBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Total efetivo</th>
              <td>{report.original.transmission.totals.totalBitLength} bits</td>
              <td>{report.compressed.transmission.totals.totalBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Tempo de transmissão</th>
              <td>{formatNumber(report.original.transmission.totalTransmissionTime)}</td>
              <td>{formatNumber(report.compressed.transmission.totalTransmissionTime)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          Razão efetiva: {formatPercent(report.comparison.compressionRatio)} · economia:{' '}
          {formatPercent(report.comparison.spaceSavingRatio)}.
        </p>
      </section>

      <section aria-labelledby="huffman-report-title">
        <h3 id="huffman-report-title">Jogador × Huffman</h3>
        <table>
          <caption>Custo da árvore escolhida e da referência</caption>
          <thead>
            <tr>
              <th scope="col">Árvore</th>
              <th scope="col">Comprimento médio</th>
              <th scope="col">Payload codificado</th>
              <th scope="col">Total efetivo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Jogador</th>
              <td>{formatNumber(report.huffman.averageCodeLength)}</td>
              <td>{report.huffman.payloadBitLength} bits</td>
              <td>{report.huffman.totalBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Huffman</th>
              <td>{formatNumber(report.huffman.referenceAverageCodeLength)}</td>
              <td>{report.huffman.referencePayloadBitLength} bits</td>
              <td>{report.huffman.referenceTotalBitLength} bits</td>
            </tr>
          </tbody>
        </table>
        <p role="status">
          {report.huffman.allChoicesGreedy
            ? 'As escolhas do jogador seguiram a regra de Huffman. '
            : 'O jogador realizou ao menos uma escolha fora da regra de Huffman. '}
          {report.huffman.isOptimal
            ? 'A comparação final mostra o mesmo custo da referência.'
            : 'A comparação final mostra um custo maior que o da referência.'}
        </p>
      </section>

      <section aria-labelledby="schedule-report-title">
        <h3 id="schedule-report-title">Ordem manual × EDD</h3>
        <p>
          Ordem manual: {report.packetOrder.join(' → ')}
          <br />
          Ordem EDD: {edd.packets.map((packet) => packet.id).join(' → ')}
        </p>
        <table>
          <caption>Resultados do escalonamento comprimido</caption>
          <thead>
            <tr>
              <th scope="col">Ordem</th>
              <th scope="col">Tempo total</th>
              <th scope="col">Maior atraso</th>
              <th scope="col">No prazo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Manual</th>
              <td>{formatNumber(manual.totalCompletionTime)}</td>
              <td>{formatNumber(manual.maxLateness)}</td>
              <td>
                {report.compressed.manualDeliveredWithinDeadline}/{report.packetCount}
              </td>
            </tr>
            <tr>
              <th scope="row">EDD</th>
              <td>{formatNumber(edd.totalCompletionTime)}</td>
              <td>{formatNumber(edd.maxLateness)}</td>
              <td>
                {report.compressed.eddDeliveredWithinDeadline}/{report.packetCount}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <button type="button" className="primary" onClick={onRestart}>
        Reiniciar missão
      </button>
    </section>
  );
}
