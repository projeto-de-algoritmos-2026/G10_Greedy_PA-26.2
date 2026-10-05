import { useMemo, useState } from 'react';
import { LabTerminal } from './components/LabTerminal';
import { MissionSelect } from './components/MissionSelect';
import { MissionView } from './components/MissionView';
import { ScenarioEditor } from './components/ScenarioEditor';
import type { TerminalId } from './components/terminals';
import { officialMissions } from './data';
import type { MissionDefinition } from './domain';
import {
  addCustomMission,
  applyGameCommand,
  buildMissionCatalog,
  createInitialGameState,
  findCatalogEntry,
  getMissionResult,
  getMissionSession,
  isMissionUnlocked,
  recordMissionCompletion,
  removeCustomMission,
  resetCampaign,
  restoreProgress,
  saveSession,
  selectCurrentMissionId,
  selectHuffmanProgress,
  selectMission,
  selectMissionReport,
} from './game';
import type { GameCommand, GameState, PlayerProgress } from './game';
import {
  getBrowserStorage,
  readStoredProgress,
  writeStoredProgress,
} from './infra/progressStorage';

type AppView = 'mission' | 'missions' | 'lab' | 'editor';

const VIEWS: readonly { readonly id: AppView; readonly label: string }[] = [
  { id: 'mission', label: 'Sala de controle' },
  { id: 'missions', label: 'Missões' },
  { id: 'lab', label: 'Laboratório' },
  { id: 'editor', label: 'Editor de cenários' },
];

const PHASE_LABEL: Readonly<Record<GameState['phase'], string>> = {
  briefing: 'Aguardando autorização',
  investigation: 'Investigação de telemetria',
  compression: 'Compressão Huffman',
  scheduling: 'Escalonamento EDD',
  transmission: 'Transmissão em curso',
  report: 'Missão concluída',
};

export default function App() {
  const [progress, setProgress] = useState<PlayerProgress>(() =>
    restoreProgress(readStoredProgress(getBrowserStorage()), officialMissions),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [view, setView] = useState<AppView>('mission');
  const [openTerminal, setOpenTerminal] = useState<TerminalId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { customMissions } = progress;
  const catalog = useMemo(
    () => buildMissionCatalog(officialMissions, customMissions),
    [customMissions],
  );
  // A missão ativa só muda por ação explícita: concluir uma missão não pode trocar a tela sob
  // o jogador. Se ela deixar de estar disponível, volta-se à missão atual da campanha.
  const [activeMissionId, setActiveMissionId] = useState(() =>
    selectCurrentMissionId(catalog, progress),
  );
  const entry = findCatalogEntry(
    catalog,
    activeMissionId !== null && isMissionUnlocked(catalog, progress, activeMissionId)
      ? activeMissionId
      : selectCurrentMissionId(catalog, progress),
  );
  if (entry === null) throw new Error('A coleção de missões oficiais está vazia.');
  const { mission } = entry;

  const state = getMissionSession(progress, mission.id) ?? createInitialGameState(mission);
  const huffmanProgress = selectHuffmanProgress(mission, state);
  const report = state.phase === 'briefing' ? null : selectMissionReport(mission, state);
  const missionStarted = state.phase !== 'briefing';

  const official = catalog.filter((candidate) => candidate.origin === 'official');
  const nextOfficial =
    entry.origin === 'official' ? (official[official.indexOf(entry) + 1] ?? null) : null;

  /** Único ponto de escrita: o que aparece na tela é sempre o que foi enviado ao armazenamento. */
  const commit = (next: PlayerProgress) => {
    setProgress(next);
    setSaveFailed(!writeStoredProgress(getBrowserStorage(), next));
  };

  const dispatch = (command: GameCommand) => {
    const result = applyGameCommand(mission, state, command);
    setError(result.ok ? null : result.error.message);
    if (!result.ok) return;

    let next = saveSession(selectMission(progress, mission.id), result.state);
    if (command.type === 'COMPLETE_TRANSMISSION') {
      const finalReport = selectMissionReport(mission, result.state);
      if (finalReport !== null) next = recordMissionCompletion(next, finalReport);
    }
    commit(next);
  };

  const openMission = (missionId: string) => {
    if (!isMissionUnlocked(catalog, progress, missionId)) return;
    const session = getMissionSession(progress, missionId);
    let next = selectMission(progress, missionId);
    // Uma missão já encerrada recomeça do briefing; uma tentativa em andamento é retomada.
    if (session?.phase === 'report') {
      const target = findCatalogEntry(catalog, missionId);
      if (target !== null) next = saveSession(next, createInitialGameState(target.mission));
    }
    commit(next);
    setActiveMissionId(missionId);
    setOpenTerminal(null);
    setError(null);
    setView('mission');
  };

  /** Aplica uma mudança que pode invalidar a missão ativa e escolhe outra quando necessário. */
  const commitCollectionChange = (next: PlayerProgress) => {
    commit(next);
    if (
      !isMissionUnlocked(
        buildMissionCatalog(officialMissions, next.customMissions),
        next,
        mission.id,
      )
    ) {
      setActiveMissionId(selectCurrentMissionId(catalog, next));
    }
    setOpenTerminal(null);
    setError(null);
  };

  const saveCustomMission = (definition: MissionDefinition): string | null => {
    const result = addCustomMission(progress, officialMissions, definition);
    if (!result.ok) return result.message;
    commit(result.progress);
    // A definição mudou: um terminal aberto mostraria dados da versão anterior.
    if (definition.id === mission.id) setOpenTerminal(null);
    return null;
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo principal
      </a>
      <header className="mission-header">
        <div>
          <p className="eyebrow">DSMC // SETOR ORBITAL 07</p>
          <h1>DeepSpace: Mission Control</h1>
          <p className="mission-subtitle">
            Comprima a telemetria com Huffman e escalone a transmissão com EDD.
          </p>
        </div>
        <dl className="system-status" aria-label="Estado atual do sistema">
          <div>
            <dt>Enlace</dt>
            <dd>
              <span aria-hidden="true">●</span> Estável
            </dd>
          </div>
          <div>
            <dt>Missão</dt>
            <dd>{mission.title}</dd>
          </div>
          <div>
            <dt>Fase</dt>
            <dd aria-live="polite">{PHASE_LABEL[state.phase]}</dd>
          </div>
          <div>
            <dt>Protocolo</dt>
            <dd>{missionStarted ? 'Operacional' : 'Em espera'}</dd>
          </div>
        </dl>
      </header>
      <nav className="mode-nav" aria-label="Modos da aplicação">
        <ul>
          {VIEWS.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main-content" tabIndex={-1}>
        {saveFailed && (
          <p className="system-message system-message-error" role="alert">
            ⚠ Não foi possível salvar o progresso neste navegador. Ele vale apenas enquanto esta
            página permanecer aberta.
          </p>
        )}
        {view === 'mission' && (
          <MissionView
            entry={entry}
            state={state}
            huffmanProgress={huffmanProgress}
            report={report}
            error={error}
            openTerminal={openTerminal}
            nextMissionTitle={
              getMissionResult(progress, mission.id) === null
                ? null
                : (nextOfficial?.mission.title ?? null)
            }
            onOpenTerminal={setOpenTerminal}
            onOpenMissions={() => setView('missions')}
            dispatch={dispatch}
          />
        )}
        {view === 'missions' && (
          <MissionSelect
            catalog={catalog}
            progress={progress}
            activeMissionId={mission.id}
            onSelectMission={openMission}
            onOpenEditor={() => setView('editor')}
            onResetCampaign={() => commitCollectionChange(resetCampaign(progress))}
          />
        )}
        {view === 'lab' && <LabTerminal />}
        {view === 'editor' && (
          <ScenarioEditor
            catalog={catalog}
            onSaveMission={saveCustomMission}
            onRemoveMission={(missionId) =>
              commitCollectionChange(removeCustomMission(progress, missionId))
            }
            onPlayMission={openMission}
          />
        )}
      </main>
      <footer className="mission-footer">
        <span>DSMC v1.0</span>
        <span>Canal seguro // simulação acadêmica</span>
      </footer>
    </div>
  );
}
