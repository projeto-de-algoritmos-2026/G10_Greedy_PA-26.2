import { useMemo } from 'react';
import { analyzeMissionTransmission } from '../domain';
import type { LoadedMission } from '../domain';
import type { GameCommand, GameState } from '../game';
import { formatNumber, formatPercent } from './format';

interface TelemetryTerminalProps {
  readonly mission: LoadedMission;
  readonly state: GameState;
  readonly dispatch: (command: GameCommand) => void;
}

/** Símbolos exibidos como amostra de cada payload; o restante é resumido pela contagem. */
const PAYLOAD_PREVIEW_SYMBOLS = 12;

/**
 * Mostra o que a sonda enviou antes de qualquer decisão: enlace, pacotes e distribuição dos
 * símbolos. Tamanhos e durações vêm do cenário original calculado pelo domínio.
 */
export function TelemetryTerminal({ mission, state, dispatch }: TelemetryTerminalProps) {
  const original = useMemo(() => analyzeMissionTransmission(mission).original, [mission]);
  const { alphabet, frequencies, originalFormat } = mission.telemetry;
  // A raiz da árvore de referência acumula o peso de todas as folhas: o total de símbolos.
  const symbolCount = mission.telemetry.tree.weight;
  const transmissionById = new Map(original.packets.map((packet) => [packet.id, packet]));
  const labels = new Map(alphabet.map((symbol) => [symbol.value, symbol.label]));
  const latestDeadline = Math.max(...mission.packets.map((packet) => packet.deadline));

  return (
    <section className="terminal" aria-labelledby="telemetry-title">
      <p className="terminal-code" aria-hidden="true">
        TRM-01 // SENSOR ARRAY
      </p>
      <h2 id="telemetry-title">Telemetria</h2>
      <p className="assumption">
        Dados recebidos da sonda, ainda sem compressão. Cada símbolo ocupa{' '}
        {originalFormat.bitsPerSymbol} bits no formato original; a duração de um pacote é o seu
        tamanho dividido pela largura de banda.
      </p>

      <h3 id="telemetry-link-title">Enlace e volume recebido</h3>
      <dl className="lab-rates" role="group" aria-labelledby="telemetry-link-title">
        <div>
          <dt>Largura de banda</dt>
          <dd>{formatNumber(mission.bandwidthBitsPerTimeUnit)} bits/u.t.</dd>
        </div>
        <div>
          <dt>Pacotes</dt>
          <dd>{mission.packets.length}</dd>
        </div>
        <div>
          <dt>Símbolos recebidos</dt>
          <dd>{symbolCount}</dd>
        </div>
        <div>
          <dt>Volume original</dt>
          <dd>{original.totals.totalBitLength} bits</dd>
        </div>
        <div>
          <dt>Tempo de canal sem compressão</dt>
          <dd>{formatNumber(original.totalTransmissionTime)} u.t.</dd>
        </div>
        <div>
          <dt>Prazo mais distante</dt>
          <dd>{formatNumber(latestDeadline)} u.t.</dd>
        </div>
      </dl>

      <h3>Pacotes</h3>
      <table>
        <caption>Pacotes recebidos, na ordem de chegada</caption>
        <thead>
          <tr>
            <th scope="col">Pacote</th>
            <th scope="col">Símbolos</th>
            <th scope="col">Tamanho original</th>
            <th scope="col">Duração sem compressão</th>
            <th scope="col">Prazo</th>
            <th scope="col">Início do payload</th>
          </tr>
        </thead>
        <tbody>
          {mission.packets.map((packet) => {
            const transmission = transmissionById.get(packet.id);
            const preview = Array.from(
              packet.payload.subarray(0, PAYLOAD_PREVIEW_SYMBOLS),
              (symbol) => `S${symbol}`,
            ).join(' ');
            return (
              <tr key={packet.id}>
                <th scope="row">{packet.id}</th>
                <td>{packet.payload.length}</td>
                <td>{packet.originalBitLength} bits</td>
                <td>
                  {transmission === undefined ? '—' : formatNumber(transmission.transmissionTime)}
                </td>
                <td>{formatNumber(packet.deadline)}</td>
                <td className="bit-code">
                  {preview}
                  {packet.payload.length > PAYLOAD_PREVIEW_SYMBOLS ? ' …' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Distribuição dos símbolos</h3>
      <table>
        <caption>Ocorrências de cada símbolo em todos os pacotes</caption>
        <thead>
          <tr>
            <th scope="col">Símbolo</th>
            <th scope="col">Descrição</th>
            <th scope="col">Ocorrências</th>
            <th scope="col">Participação</th>
          </tr>
        </thead>
        <tbody>
          {frequencies.map(({ symbol, weight }) => (
            <tr key={symbol}>
              <th scope="row">S{symbol}</th>
              <td>{labels.get(symbol) ?? `símbolo ${symbol}`}</td>
              <td>{weight}</td>
              <td>{formatPercent(weight / symbolCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        A distribuição não é uniforme: no terminal Huffman, os símbolos mais frequentes recebem os
        códigos mais curtos.
      </p>

      {state.phase === 'investigation' ? (
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'FINISH_INVESTIGATION' })}
        >
          Concluir investigação
        </button>
      ) : (
        <p role="status">
          ✔ Investigação concluída. Os dados permanecem disponíveis para consulta.
        </p>
      )}
    </section>
  );
}
