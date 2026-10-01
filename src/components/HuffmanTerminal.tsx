import { useState } from 'react';
import type { HuffmanNode } from '../algorithms/huffman';
import type { LoadedMission, MissionReport } from '../domain';
import {
  assessHuffmanMergeChoice,
  type GameCommand,
  type GameState,
  type HuffmanProgress,
} from '../game';
import { formatNumber } from './format';
import { HuffmanTree } from './HuffmanTree';

interface HuffmanTerminalProps {
  readonly mission: LoadedMission;
  readonly state: GameState;
  readonly progress: HuffmanProgress;
  readonly report: MissionReport | null;
  readonly dispatch: (command: GameCommand) => void;
}

function symbolLabel(mission: LoadedMission, symbol: number): string {
  return (
    mission.telemetry.alphabet.find((entry) => entry.value === symbol)?.label ?? `símbolo ${symbol}`
  );
}

function nodeLabel(mission: LoadedMission, node: HuffmanNode): string {
  return node.kind === 'leaf'
    ? `${symbolLabel(mission, node.symbol)} (S${node.symbol})`
    : `nó combinado ${node.id.replace('branch-', '#')}`;
}

/** Executa fusões manuais sem recalcular frequências, custos ou códigos na apresentação. */
export function HuffmanTerminal({
  mission,
  state,
  progress,
  report,
  dispatch,
}: HuffmanTerminalProps) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [reviewedStep, setReviewedStep] = useState<number | null>(null);
  const editable = state.phase === 'compression' && !progress.complete;
  const assessment =
    selectedIds.length === 2
      ? assessHuffmanMergeChoice(progress.activeNodes, selectedIds[0] ?? '', selectedIds[1] ?? '')
      : null;
  const lastStep = progress.history[progress.history.length - 1];
  const reviewed = reviewedStep === null ? undefined : progress.history[reviewedStep];
  const displayedRoot = reviewed?.merged ?? progress.root ?? lastStep?.merged ?? null;
  const displayedTitle = reviewed
    ? `Fusão ${reviewed.index + 1}: ${reviewed.firstExtracted.weight} + ${reviewed.secondExtracted.weight} = ${reviewed.merged.weight}`
    : progress.complete
      ? 'Árvore construída pelo jogador'
      : 'Subárvore produzida pela fusão mais recente';

  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };
  const mergeSelected = () => {
    if (assessment === null) return;
    dispatch({
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: assessment.firstNode.id,
      secondNodeId: assessment.secondNode.id,
    });
    setSelectedIds([]);
    setReviewedStep(null);
  };
  const undoLastMerge = () => {
    dispatch({ type: 'UNDO_HUFFMAN_MERGE' });
    setSelectedIds([]);
    setReviewedStep(null);
  };

  return (
    <section className="terminal" aria-labelledby="huffman-title">
      <h2 id="huffman-title">Terminal Huffman</h2>
      <p className="assumption">
        Selecione os dois menores pesos a cada etapa. Empates entre mínimos são equivalentes; uma
        escolha diferente pode continuar e só será julgada pelo custo da árvore completa.
      </p>

      <h3>Frequências da telemetria</h3>
      <table>
        <caption>Símbolos e frequências calculadas para todos os pacotes</caption>
        <thead>
          <tr>
            <th scope="col">Símbolo</th>
            <th scope="col">Descrição</th>
            <th scope="col">Frequência</th>
          </tr>
        </thead>
        <tbody>
          {mission.telemetry.frequencies.map(({ symbol, weight }) => (
            <tr key={symbol}>
              <th scope="row">S{symbol}</th>
              <td>{symbolLabel(mission, symbol)}</td>
              <td>{weight}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby="heap-title">
        <h3 id="heap-title">Min-heap e candidatos</h3>
        <p>A raiz aparece primeiro. Selecione dois nós: {selectedIds.length}/2 selecionados.</p>
        <ol className="heap-list" aria-label="Min-heap de candidatos em ordem de prioridade">
          {progress.activeNodes.map((node, index) => {
            const selected = selectedIds.includes(node.id);
            return (
              <li key={node.id} className={selected ? 'candidate-selected' : undefined}>
                <span>
                  <strong>{index === 0 ? 'Raiz' : `Posição ${index + 1}`}</strong>
                  <span>{nodeLabel(mission, node)}</span>
                  <span>Peso {node.weight}</span>
                </span>
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={!editable || (!selected && selectedIds.length === 2)}
                  onClick={() => toggleSelection(node.id)}
                >
                  {selected ? 'Remover seleção' : `Selecionar ${nodeLabel(mission, node)}`}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {assessment !== null && assessment.followsGreedyRule && (
        <div className="merge-confirmation">
          <p role="status">
            Par mínimo válido: {assessment.firstNode.weight} + {assessment.secondNode.weight} ={' '}
            {assessment.mergedWeight}.
          </p>
          <button type="button" className="primary" onClick={mergeSelected}>
            Fundir nós selecionados
          </button>
        </div>
      )}
      {assessment !== null && !assessment.followsGreedyRule && (
        <div className="choice-warning" role="alert">
          <strong>Escolha fora da regra de Huffman</strong>
          <p>
            Este par não contém os dois menores pesos atuais. A qualidade da árvore será comparada
            somente depois que todas as fusões terminarem.
          </p>
          <button type="button" onClick={() => setSelectedIds([])}>
            Rever escolha
          </button>{' '}
          <button type="button" className="primary" onClick={mergeSelected}>
            Continuar com a fusão
          </button>
        </div>
      )}

      <section aria-labelledby="history-title">
        <h3 id="history-title">Histórico de fusões</h3>
        {progress.history.length === 0 ? (
          <p>Nenhuma fusão realizada.</p>
        ) : (
          <ol className="merge-history">
            {progress.history.map((step, index) => (
              <li key={step.merged.id}>
                <span>
                  <strong>Fusão {index + 1}:</strong> {nodeLabel(mission, step.firstExtracted)} (
                  {step.firstExtracted.weight}) + {nodeLabel(mission, step.secondExtracted)} (
                  {step.secondExtracted.weight}) = {step.merged.weight}.{' '}
                  {progress.greedyChoiceHistory[index]
                    ? 'Seguiu a regra de Huffman.'
                    : 'Fora da regra; custo ainda não avaliado nesta etapa.'}
                </span>
                <button type="button" onClick={() => setReviewedStep(index)}>
                  Revisar fusão {index + 1}
                </button>
              </li>
            ))}
          </ol>
        )}
        {reviewedStep !== null && (
          <button type="button" onClick={() => setReviewedStep(null)}>
            Mostrar estado atual
          </button>
        )}{' '}
        {state.phase === 'compression' && progress.history.length > 0 && (
          <button type="button" onClick={undoLastMerge}>
            Desfazer última fusão
          </button>
        )}
      </section>

      <HuffmanTree
        root={displayedRoot}
        title={displayedTitle}
        alphabet={mission.telemetry.alphabet}
      />

      {report !== null && (
        <section aria-labelledby="codes-title">
          <h3 id="codes-title">Códigos e comparação final</h3>
          <table>
            <caption>Tabela de códigos da árvore do jogador</caption>
            <thead>
              <tr>
                <th scope="col">Símbolo</th>
                <th scope="col">Código</th>
                <th scope="col">Comprimento</th>
              </tr>
            </thead>
            <tbody>
              {mission.telemetry.alphabet.map((symbol) => {
                const code = report.huffman.codeTable[symbol.value] ?? '';
                return (
                  <tr key={symbol.value}>
                    <th scope="row">{symbol.label}</th>
                    <td className="bit-code">{code}</td>
                    <td>{code.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table>
            <caption>Jogador × Huffman de referência</caption>
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
          <p role="status" className={report.huffman.isOptimal ? 'result-ok' : 'result-warn'}>
            {report.huffman.allChoicesGreedy
              ? 'Todas as fusões seguiram a regra de Huffman. '
              : 'Ao menos uma fusão saiu da regra de Huffman. '}
            {report.huffman.isOptimal
              ? 'Após comparar o custo final, sua árvore alcançou o mesmo custo da referência.'
              : 'Após comparar o custo final, sua árvore codificou mais bits que a referência.'}
          </p>
        </section>
      )}

      {state.phase === 'compression' && progress.complete && (
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'CONFIRM_COMPRESSION' })}
        >
          Confirmar árvore e continuar
        </button>
      )}
    </section>
  );
}
