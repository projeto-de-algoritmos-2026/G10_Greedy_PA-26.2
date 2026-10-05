import { useState } from 'react';
import { getMissionResult, getMissionSession, isMissionUnlocked } from '../game';
import type { GamePhase, MissionCatalog, MissionCatalogEntry, PlayerProgress } from '../game';
import { formatNumber } from './format';

interface MissionSelectProps {
  readonly catalog: MissionCatalog;
  readonly progress: PlayerProgress;
  readonly activeMissionId: string | null;
  readonly onSelectMission: (missionId: string) => void;
  readonly onOpenEditor: () => void;
  readonly onResetCampaign: () => void;
}

const PHASE_LABEL: Readonly<Record<GamePhase, string>> = {
  briefing: 'briefing',
  investigation: 'investigação',
  compression: 'compressão',
  scheduling: 'escalonamento',
  transmission: 'transmissão',
  report: 'relatório',
};

interface MissionCardProps {
  readonly entry: MissionCatalogEntry;
  readonly index: number;
  readonly progress: PlayerProgress;
  readonly unlocked: boolean;
  readonly active: boolean;
  /** Missão que precisa ser concluída antes desta, quando bloqueada. */
  readonly previousTitle: string | null;
  readonly onSelect: () => void;
}

function MissionCard({
  entry,
  index,
  progress,
  unlocked,
  active,
  previousTitle,
  onSelect,
}: MissionCardProps) {
  const { mission } = entry;
  const result = getMissionResult(progress, mission.id);
  const session = getMissionSession(progress, mission.id);
  const inProgress = session !== null && session.phase !== 'report';
  const hintId = `mission-hint-${mission.id}`;

  const status = !unlocked
    ? `🔒 Bloqueada — conclua “${previousTitle ?? 'a missão anterior'}” para liberar.`
    : inProgress
      ? `◐ Em andamento — fase de ${PHASE_LABEL[session.phase]}.`
      : result !== null
        ? `✔ Concluída ${result.completions}×.`
        : '● Disponível.';
  const action = inProgress
    ? 'Continuar missão'
    : result !== null
      ? 'Jogar novamente'
      : 'Abrir missão';

  return (
    <li
      className={`mission-card${unlocked ? '' : ' mission-card-locked'}`}
      aria-current={active ? 'true' : undefined}
    >
      <h4>
        <span className="mission-card-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>{' '}
        {mission.title}
      </h4>
      <p>{mission.briefing}</p>
      <dl className="mission-card-facts">
        <div>
          <dt>Banda</dt>
          <dd>{formatNumber(mission.bandwidthBitsPerTimeUnit)} bits/u.t.</dd>
        </div>
        <div>
          <dt>Pacotes</dt>
          <dd>{mission.packets.length}</dd>
        </div>
        <div>
          <dt>Símbolos</dt>
          <dd>{mission.telemetry.frequencies.length}</dd>
        </div>
      </dl>
      <p id={hintId} className="mission-card-status">
        {status}
      </p>
      {result !== null && (
        <ul className="mission-card-marks" aria-label={`Marcas em ${mission.title}`}>
          <li>
            {result.optimalHuffman
              ? '✔ Árvore com o custo de Huffman'
              : '○ Árvore com o custo de Huffman ainda não alcançada'}
          </li>
          <li>
            {result.matchedEdd
              ? '✔ Atraso máximo igual ao de EDD'
              : '○ Atraso máximo de EDD ainda não alcançado'}
          </li>
          <li>Menor atraso máximo obtido: {formatNumber(result.bestMaxLateness)}</li>
        </ul>
      )}
      {/* aria-disabled mantém o botão focável para que o motivo do bloqueio seja anunciado. */}
      <button
        type="button"
        className={unlocked ? 'primary' : undefined}
        aria-disabled={!unlocked}
        aria-describedby={hintId}
        aria-label={`${action}: ${mission.title}`}
        onClick={() => {
          if (unlocked) onSelect();
        }}
      >
        {action}
      </button>
    </li>
  );
}

/** Coleção de missões: campanha oficial com liberação em sequência e cenários importados. */
export function MissionSelect({
  catalog,
  progress,
  activeMissionId,
  onSelectMission,
  onOpenEditor,
  onResetCampaign,
}: MissionSelectProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const official = catalog.filter((entry) => entry.origin === 'official');
  const custom = catalog.filter((entry) => entry.origin === 'custom');
  const completed = official.filter(
    (entry) => getMissionResult(progress, entry.mission.id) !== null,
  ).length;
  const hasSavedData =
    Object.keys(progress.results).length > 0 || Object.keys(progress.sessions).length > 0;

  const renderCard = (entry: MissionCatalogEntry, index: number, previousTitle: string | null) => (
    <MissionCard
      key={entry.mission.id}
      entry={entry}
      index={index}
      progress={progress}
      unlocked={isMissionUnlocked(catalog, progress, entry.mission.id)}
      active={entry.mission.id === activeMissionId}
      previousTitle={previousTitle}
      onSelect={() => onSelectMission(entry.mission.id)}
    />
  );

  return (
    <section className="terminal mission-select" aria-labelledby="missions-title">
      <p className="terminal-code" aria-hidden="true">
        OPS-01 // MISSION ARCHIVE
      </p>
      <h2 id="missions-title">Missões</h2>
      <p className="assumption">
        {completed} de {official.length} missões oficiais concluídas. O progresso fica salvo somente
        neste navegador, sem conta e sem envio de dados.
      </p>

      <h3 id="campaign-title">Campanha</h3>
      <ol className="mission-list" aria-labelledby="campaign-title">
        {official.map((entry, index) =>
          renderCard(entry, index, official[index - 1]?.mission.title ?? null),
        )}
      </ol>

      <h3 id="custom-title">Cenários importados</h3>
      {custom.length === 0 ? (
        <p>
          Nenhum cenário importado.{' '}
          <button type="button" onClick={onOpenEditor}>
            Abrir editor de cenários
          </button>
        </p>
      ) : (
        <ol className="mission-list" aria-labelledby="custom-title">
          {custom.map((entry, index) => renderCard(entry, index, null))}
        </ol>
      )}

      <h3>Dados salvos</h3>
      {confirmingReset ? (
        <div className="choice-warning" role="alert">
          <strong>Apagar o progresso da campanha?</strong>
          <p>
            Resultados e tentativas em andamento serão removidos deste navegador. Os cenários
            importados são mantidos.
          </p>
          <button type="button" onClick={() => setConfirmingReset(false)}>
            Cancelar
          </button>{' '}
          <button
            type="button"
            className="primary"
            onClick={() => {
              setConfirmingReset(false);
              onResetCampaign();
            }}
          >
            Confirmar e apagar
          </button>
        </div>
      ) : (
        <button type="button" disabled={!hasSavedData} onClick={() => setConfirmingReset(true)}>
          Apagar progresso da campanha
        </button>
      )}
    </section>
  );
}
