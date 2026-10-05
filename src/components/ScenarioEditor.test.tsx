import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { officialMissions } from '../data';
import { buildMissionReport, loadMission, parseMissionJson, serializeMission } from '../domain';
import type { MissionDefinition } from '../domain';
import { buildMissionCatalog, MAX_CUSTOM_MISSIONS } from '../game';
import { captureDownloads } from '../test/downloads';
import { createCustomDefinition } from '../test/missionFixtures';
import { ScenarioEditor } from './ScenarioEditor';

function renderEditor(customMissions: readonly MissionDefinition[] = []) {
  const handlers = {
    onSaveMission: vi.fn<(definition: MissionDefinition) => string | null>(() => null),
    onRemoveMission: vi.fn<(missionId: string) => void>(),
    onPlayMission: vi.fn<(missionId: string) => void>(),
  };
  render(
    <ScenarioEditor
      catalog={buildMissionCatalog(officialMissions, customMissions)}
      {...handlers}
    />,
  );
  return handlers;
}

const documentField = () => screen.getByLabelText<HTMLTextAreaElement>('Documento JSON da missão');
const saveButton = () =>
  screen.getByRole('button', { name: /Adicionar à coleção|Atualizar cenário/ });

async function pasteDocument(user: ReturnType<typeof userEvent.setup>, document: unknown) {
  await user.clear(documentField());
  await user.click(documentField());
  await user.paste(typeof document === 'string' ? document : JSON.stringify(document));
}

afterEach(() => vi.restoreAllMocks());

describe('ScenarioEditor', () => {
  it('começa vazio, sem permitir salvar ou exportar', () => {
    renderEditor();

    expect(
      screen.getByText(/Cole um documento, importe um arquivo ou carregue um modelo/),
    ).toBeVisible();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baixar JSON' })).toBeDisabled();
    expect(
      screen.getByText(/Prioridades, datas de liberação e preempção não fazem parte/),
    ).toBeVisible();
  });

  it('carrega uma missão oficial como modelo já com um ID que não colide', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.selectOptions(
      screen.getByLabelText('Começar a partir de uma missão'),
      'solar-storm',
    );
    await user.click(screen.getByRole('button', { name: 'Carregar modelo' }));

    const parsed = parseMissionJson(documentField().value);
    expect(parsed).toMatchObject({
      ok: true,
      definition: { id: 'solar-storm-copia', title: 'Tempestade solar (cópia)' },
    });
    expect(screen.getByText(/Documento válido no schema v1/)).toBeVisible();
    expect(saveButton()).toBeEnabled();
  });

  it('pré-visualiza as métricas calculadas pela simulação do cenário', async () => {
    const user = userEvent.setup();
    const definition = createCustomDefinition();
    const report = buildMissionReport(loadMission(definition));
    renderEditor();
    await pasteDocument(user, definition);

    const cells = (name: RegExp) =>
      within(screen.getByRole('row', { name }))
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells(/^Total efetivo/)).toEqual([
      `${report.original.transmission.totals.totalBitLength} bits`,
      `${report.compressed.transmission.totals.totalBitLength} bits`,
    ]);
    expect(cells(/^Cabeçalho/)).toEqual([
      '0 bits',
      `${report.compressed.transmission.totals.headerBitLength} bits`,
    ]);
    expect(cells(/^Pacotes no prazo com EDD/)).toEqual([
      `${report.original.eddDeliveredWithinDeadline}/2`,
      `${report.compressed.eddDeliveredWithinDeadline}/2`,
    ]);
    expect(screen.getByText(/6 símbolos em 2 pacotes/)).toBeVisible();
  });

  it('salva o documento normalizado e oferece jogar o cenário', async () => {
    const user = userEvent.setup();
    const definition = createCustomDefinition();
    const { onSaveMission, onPlayMission } = renderEditor();
    await pasteDocument(user, definition);

    await user.click(screen.getByRole('button', { name: 'Adicionar à coleção' }));

    expect(onSaveMission).toHaveBeenCalledExactlyOnceWith(definition);
    expect(
      screen.getByText(/Cenário “Retransmissor de teste” adicionado na coleção/),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Jogar este cenário' }));
    expect(onPlayMission).toHaveBeenCalledExactlyOnceWith('custom-relay');
  });

  it('lista todos os problemas com seus caminhos e bloqueia o salvamento', async () => {
    const user = userEvent.setup();
    const { onSaveMission } = renderEditor();
    await pasteDocument(user, {
      ...createCustomDefinition(),
      title: '',
      bandwidthBitsPerTimeUnit: 0,
      packets: [{ id: 'a', deadline: -1, payload: [0, 1] }],
    });

    const issues = within(screen.getByRole('status')).getAllByRole('listitem');
    expect(screen.getByText(/3 problemas encontrados/)).toBeVisible();
    expect(issues.map((issue) => issue.querySelector('code')?.textContent)).toEqual([
      'title',
      'bandwidthBitsPerTimeUnit',
      'packets[0].deadline',
    ]);
    expect(documentField()).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baixar JSON' })).toBeDisabled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(onSaveMission).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON malformado', '{ "schemaVersion": 1, ', /JSON inválido/],
    [
      'versão desconhecida',
      { ...createCustomDefinition(), schemaVersion: 2 },
      /versão 2 não suportada/,
    ],
    [
      'regra de escalonamento fora do modelo',
      {
        ...createCustomDefinition(),
        packets: [{ id: 'a', deadline: 10, payload: [0, 1], releaseTime: 3 }],
      },
      /exigem outro modelo de escalonamento, não EDD/,
    ],
    [
      'símbolo fora do alfabeto',
      { ...createCustomDefinition(), packets: [{ id: 'a', deadline: 1, payload: [0, 1, 9] }] },
      /símbolo 9 não pertence ao alfabeto/,
    ],
  ])('rejeita %s', async (_name, document, message) => {
    const user = userEvent.setup();
    renderEditor();
    await pasteDocument(user, document);

    expect(screen.getByText(message)).toBeVisible();
    expect(saveButton()).toBeDisabled();
  });

  it('não deixa um cenário importado tomar o ID de uma missão oficial', async () => {
    const user = userEvent.setup();
    renderEditor();
    await pasteDocument(user, serializeMission(officialMissions[0]!));

    expect(screen.getByText(/Documento válido/)).toBeVisible();
    expect(screen.getByText(/pertence a uma missão oficial/)).toBeVisible();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baixar JSON' })).toBeEnabled();
  });

  it('respeita o limite de cenários importados, mas permite atualizar um existente', async () => {
    const user = userEvent.setup();
    const custom = Array.from({ length: MAX_CUSTOM_MISSIONS }, (_, index) =>
      createCustomDefinition(`m-${index}`),
    );
    renderEditor(custom);

    await pasteDocument(user, createCustomDefinition('mais-um'));
    expect(screen.getByText(/A coleção já possui 12 cenários importados/)).toBeVisible();
    expect(saveButton()).toBeDisabled();

    await pasteDocument(user, createCustomDefinition('m-3'));
    expect(screen.getByRole('button', { name: 'Atualizar cenário na coleção' })).toBeEnabled();
  });

  it('exibe a mensagem devolvida quando a coleção recusa o cenário', async () => {
    const user = userEvent.setup();
    const { onSaveMission } = renderEditor();
    onSaveMission.mockReturnValue('Coleção indisponível.');
    await pasteDocument(user, createCustomDefinition());

    await user.click(screen.getByRole('button', { name: 'Adicionar à coleção' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Coleção indisponível.');
    expect(screen.queryByRole('button', { name: 'Jogar este cenário' })).not.toBeInTheDocument();
  });

  it('importa um arquivo .json e recusa arquivos acima do limite', async () => {
    const user = userEvent.setup();
    renderEditor();
    const input = screen.getByLabelText('Importar arquivo .json');

    await user.upload(
      input,
      new File([serializeMission(createCustomDefinition('do-arquivo'))], 'cenario.json', {
        type: 'application/json',
      }),
    );
    expect(await screen.findByText(/Documento válido/)).toBeVisible();
    expect(documentField().value).toContain('"id": "do-arquivo"');

    await user.upload(
      input,
      new File([' '.repeat(300 * 1024)], 'enorme.json', { type: 'application/json' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('o limite para um documento');
    expect(documentField().value).toContain('"id": "do-arquivo"');
  });

  it('exporta o documento validado como JSON reimportável', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const definition = createCustomDefinition();
    renderEditor();
    await pasteDocument(user, definition);

    await user.click(screen.getByRole('button', { name: 'Baixar JSON' }));
    const [file] = await downloads.read();

    expect(file?.fileName).toBe('custom-relay.json');
    expect(file?.mimeType).toBe('application/json');
    const text = new TextDecoder().decode(Uint8Array.from(file?.bytes ?? []));
    expect(parseMissionJson(text)).toEqual({ ok: true, definition });
  });

  it('permite editar e remover cenários importados, com confirmação antes de remover', async () => {
    const user = userEvent.setup();
    const { onRemoveMission } = renderEditor([createCustomDefinition()]);

    await user.click(screen.getByRole('button', { name: 'Editar Retransmissor de teste' }));
    expect(parseMissionJson(documentField().value)).toEqual({
      ok: true,
      definition: createCustomDefinition(),
    });
    expect(screen.getByRole('button', { name: 'Atualizar cenário na coleção' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remover Retransmissor de teste' }));
    expect(onRemoveMission).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Cancelar remoção de Retransmissor de teste' }),
    );
    await user.click(screen.getByRole('button', { name: 'Remover Retransmissor de teste' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar remoção de Retransmissor de teste' }),
    );
    expect(onRemoveMission).toHaveBeenCalledExactlyOnceWith('custom-relay');
  });
});
