import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  buildMissionReport,
  loadMission,
  MISSION_LIMITS,
  MISSION_SCHEMA_VERSION,
  parseMissionJson,
  serializeMission,
} from '../domain';
import type { MissionDefinition, MissionReport, MissionValidationIssue } from '../domain';
import { MAX_CUSTOM_MISSIONS } from '../game';
import type { MissionCatalog } from '../game';
import { downloadText } from '../infra/download';
import { readFileText } from '../infra/readFile';
import { formatNumber, formatPercent } from './format';

interface ScenarioEditorProps {
  readonly catalog: MissionCatalog;
  /** Devolve uma mensagem de erro ou `null` quando o cenário entrou na coleção. */
  readonly onSaveMission: (definition: MissionDefinition) => string | null;
  readonly onRemoveMission: (missionId: string) => void;
  readonly onPlayMission: (missionId: string) => void;
}

type Draft =
  | { readonly status: 'empty' }
  | { readonly status: 'invalid'; readonly issues: readonly MissionValidationIssue[] }
  | {
      readonly status: 'valid';
      readonly definition: MissionDefinition;
      readonly report: MissionReport;
      readonly symbolCount: number;
    };

interface Notice {
  readonly kind: 'ok' | 'error';
  readonly message: string;
  readonly missionId?: string;
}

/** Valida o texto e simula o cenário com a árvore de referência e a ordem declarada. */
function evaluateDraft(text: string): Draft {
  if (text.trim().length === 0) return { status: 'empty' };
  const validation = parseMissionJson(text);
  if (!validation.ok) return { status: 'invalid', issues: validation.issues };

  const mission = loadMission(validation.definition);
  return {
    status: 'valid',
    definition: validation.definition,
    report: buildMissionReport(mission),
    symbolCount: mission.telemetry.tree.weight,
  };
}

/** Uma cópia com outro ID evita colidir com a missão oficial usada como ponto de partida. */
function templateFrom(definition: MissionDefinition, official: boolean): string {
  return serializeMission(
    official
      ? {
          ...definition,
          id: `${definition.id}-copia`.slice(0, MISSION_LIMITS.maxIdLength),
          title: `${definition.title} (cópia)`.slice(0, MISSION_LIMITS.maxTitleLength),
        }
      : definition,
  );
}

/** Editor de documentos de missão: importar, validar, pré-visualizar, salvar e exportar. */
export function ScenarioEditor({
  catalog,
  onSaveMission,
  onRemoveMission,
  onPlayMission,
}: ScenarioEditorProps) {
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState(catalog[0]?.mission.id ?? '');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null);
  const draft = useMemo(() => evaluateDraft(text), [text]);

  const custom = catalog.filter((entry) => entry.origin === 'custom');
  const draftId = draft.status === 'valid' ? draft.definition.id : null;
  const clashesWithOfficial = catalog.some(
    (entry) => entry.origin === 'official' && entry.mission.id === draftId,
  );
  const replacesCustom = custom.some((entry) => entry.mission.id === draftId);
  const collectionFull = !replacesCustom && custom.length >= MAX_CUSTOM_MISSIONS;

  // O modelo selecionado pode ter sido removido da coleção desde a última escolha.
  const selectedTemplateId = catalog.some((entry) => entry.mission.id === templateId)
    ? templateId
    : (catalog[0]?.mission.id ?? '');

  const editText = (value: string) => {
    setText(value);
    setNotice(null);
  };

  const loadTemplate = () => {
    const entry = catalog.find((candidate) => candidate.mission.id === selectedTemplateId);
    if (entry !== undefined) editText(templateFrom(entry.definition, entry.origin === 'official'));
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    if (file.size > MISSION_LIMITS.maxDocumentLength) {
      setNotice({
        kind: 'error',
        message: `O arquivo tem ${file.size} bytes; o limite para um documento de missão é ${MISSION_LIMITS.maxDocumentLength}.`,
      });
      return;
    }
    try {
      editText(await readFileText(file));
    } catch {
      setNotice({ kind: 'error', message: 'Não foi possível ler o arquivo selecionado.' });
    }
  };

  const saveMission = () => {
    if (draft.status !== 'valid') return;
    const failure = onSaveMission(draft.definition);
    setNotice(
      failure === null
        ? {
            kind: 'ok',
            message: `Cenário “${draft.definition.title}” ${replacesCustom ? 'atualizado' : 'adicionado'} na coleção.`,
            missionId: draft.definition.id,
          }
        : { kind: 'error', message: failure },
    );
  };

  return (
    <section className="terminal scenario-editor" aria-labelledby="editor-title">
      <p className="terminal-code" aria-hidden="true">
        EDT-01 // SCENARIO FORGE
      </p>
      <h2 id="editor-title">Editor de cenários</h2>
      <p className="assumption">
        Um cenário é um documento JSON no schema v{MISSION_SCHEMA_VERSION}. O modelo de
        escalonamento é fixo — um único canal, todos os pacotes disponíveis em t = 0, sem preempção
        — porque são essas as hipóteses sob as quais EDD minimiza o atraso máximo. Prioridades,
        datas de liberação e preempção não fazem parte do schema.
      </p>

      <h3>Documento</h3>
      <div className="editor-sources">
        <div>
          <label htmlFor="editor-template">Começar a partir de uma missão</label>
          <div className="field-row">
            <select
              id="editor-template"
              value={selectedTemplateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {catalog.map(({ mission, origin }) => (
                <option key={mission.id} value={mission.id}>
                  {mission.title}
                  {origin === 'custom' ? ' (importado)' : ''}
                </option>
              ))}
            </select>
            <button type="button" onClick={loadTemplate}>
              Carregar modelo
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="editor-file">Importar arquivo .json</label>
          <input
            id="editor-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void importFile(event)}
          />
        </div>
      </div>
      <label htmlFor="editor-json">Documento JSON da missão</label>
      <textarea
        id="editor-json"
        className="editor-json"
        rows={18}
        spellCheck={false}
        value={text}
        aria-describedby="editor-validation"
        aria-invalid={draft.status === 'invalid'}
        onChange={(event) => editText(event.target.value)}
      />

      <h3>Validação</h3>
      <div id="editor-validation" role="status">
        {draft.status === 'empty' && (
          <p>Cole um documento, importe um arquivo ou carregue um modelo para começar.</p>
        )}
        {draft.status === 'invalid' && (
          <>
            <p className="result-warn">
              ⚠ {draft.issues.length}{' '}
              {draft.issues.length === 1 ? 'problema encontrado' : 'problemas encontrados'}. O
              cenário não pode ser salvo.
            </p>
            <ul className="issue-list">
              {draft.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <code>{issue.path}</code> — {issue.message}
                </li>
              ))}
            </ul>
          </>
        )}
        {draft.status === 'valid' && (
          <p className="result-ok">✔ Documento válido no schema v{MISSION_SCHEMA_VERSION}.</p>
        )}
        {clashesWithOfficial && (
          <p className="result-warn">
            ⚠ O ID “{draftId}” pertence a uma missão oficial. Altere o campo <code>id</code> para
            salvar.
          </p>
        )}
        {draft.status === 'valid' && collectionFull && (
          <p className="result-warn">
            ⚠ A coleção já possui {MAX_CUSTOM_MISSIONS} cenários importados. Remova um para salvar
            outro.
          </p>
        )}
      </div>

      {draft.status === 'valid' && (
        <table>
          <caption>Pré-visualização calculada com a árvore de Huffman e a ordem EDD</caption>
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              <th scope="col">Original</th>
              <th scope="col">Comprimido</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Total efetivo</th>
              <td>{draft.report.original.transmission.totals.totalBitLength} bits</td>
              <td>{draft.report.compressed.transmission.totals.totalBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Cabeçalho</th>
              <td>{draft.report.original.transmission.totals.headerBitLength} bits</td>
              <td>{draft.report.compressed.transmission.totals.headerBitLength} bits</td>
            </tr>
            <tr>
              <th scope="row">Tempo de transmissão</th>
              <td>{formatNumber(draft.report.original.transmission.totalTransmissionTime)}</td>
              <td>{formatNumber(draft.report.compressed.transmission.totalTransmissionTime)}</td>
            </tr>
            <tr>
              <th scope="row">Atraso máximo com EDD</th>
              <td>{formatNumber(draft.report.original.schedules.referenceEdd.maxLateness)}</td>
              <td>{formatNumber(draft.report.compressed.schedules.referenceEdd.maxLateness)}</td>
            </tr>
            <tr>
              <th scope="row">Pacotes no prazo com EDD</th>
              <td>
                {draft.report.original.eddDeliveredWithinDeadline}/{draft.report.packetCount}
              </td>
              <td>
                {draft.report.compressed.eddDeliveredWithinDeadline}/{draft.report.packetCount}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                {draft.symbolCount} símbolos em {draft.report.packetCount} pacotes · comprimento
                médio {formatNumber(draft.report.huffman.referenceAverageCodeLength)} bits ·
                economia efetiva {formatPercent(draft.report.comparison.spaceSavingRatio)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="lab-actions">
        <button
          type="button"
          className="primary"
          disabled={draft.status !== 'valid' || clashesWithOfficial || collectionFull}
          onClick={saveMission}
        >
          {replacesCustom ? 'Atualizar cenário na coleção' : 'Adicionar à coleção'}
        </button>
        <button
          type="button"
          disabled={draft.status !== 'valid'}
          onClick={() => {
            if (draft.status !== 'valid') return;
            downloadText(
              serializeMission(draft.definition),
              `${draft.definition.id}.json`,
              'application/json',
            );
          }}
        >
          Baixar JSON
        </button>
      </div>
      {notice !== null && (
        <div
          className={`system-message${notice.kind === 'error' ? ' system-message-error' : ''}`}
          role={notice.kind === 'error' ? 'alert' : undefined}
        >
          <p>
            {notice.kind === 'error' ? '⚠' : '✔'} {notice.message}
          </p>
          {notice.missionId !== undefined && (
            <button type="button" onClick={() => onPlayMission(notice.missionId ?? '')}>
              Jogar este cenário
            </button>
          )}
        </div>
      )}

      <h3 id="editor-collection-title">Cenários importados</h3>
      {custom.length === 0 ? (
        <p>Nenhum cenário importado neste navegador.</p>
      ) : (
        <>
          <p>Remover um cenário também apaga o resultado e a tentativa salvos para ele.</p>
          <ul className="order-list" aria-labelledby="editor-collection-title">
            {custom.map(({ mission, definition }) => (
              <li key={mission.id}>
                <span className="order-id">
                  {mission.title} <code>{mission.id}</code>
                </span>
                <button
                  type="button"
                  aria-label={`Editar ${mission.title}`}
                  onClick={() => editText(serializeMission(definition))}
                >
                  Editar
                </button>
                {confirmingRemovalId === mission.id ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Cancelar remoção de ${mission.title}`}
                      onClick={() => setConfirmingRemovalId(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary"
                      aria-label={`Confirmar remoção de ${mission.title}`}
                      onClick={() => {
                        setConfirmingRemovalId(null);
                        setNotice(null);
                        onRemoveMission(mission.id);
                      }}
                    >
                      Confirmar remoção
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remover ${mission.title}`}
                    onClick={() => setConfirmingRemovalId(mission.id)}
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
