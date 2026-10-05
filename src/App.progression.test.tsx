import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { officialMissions } from './data';
import { buildMissionReport, loadMission, serializeMission } from './domain';
import type { LoadedMission } from './domain';
import {
  addCustomMission,
  createEmptyProgress,
  recordMissionCompletion,
  restoreProgress,
  saveSession,
  selectMission,
} from './game';
import type { PlayerProgress } from './game';
import { PROGRESS_STORAGE_KEY } from './infra/progressStorage';
import { createCustomDefinition, playUntil } from './test/missionFixtures';

const [alpha, tiedOrbit, solarStorm] = officialMissions.map((definition) =>
  loadMission(definition),
) as [LoadedMission, LoadedMission, LoadedMission];

const seedProgress = (progress: PlayerProgress) =>
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));

const storedProgress = (): PlayerProgress =>
  restoreProgress(
    JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? 'null'),
    officialMissions,
  );

const openMode = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(
    within(screen.getByRole('navigation', { name: 'Modos da aplicação' })).getByRole('button', {
      name,
    }),
  );

const missionCard = (title: string): HTMLElement => {
  const card = screen.getByRole('heading', { level: 4, name: new RegExp(title) }).closest('li');
  if (card === null) throw new Error(`Cartão da missão ${title} ausente.`);
  return card;
};

async function completeCurrentMission(user: ReturnType<typeof userEvent.setup>, merges: number) {
  await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));
  await user.click(screen.getByRole('button', { name: /Telemetria/ }));
  await user.click(screen.getByRole('button', { name: 'Concluir investigação' }));
  await user.click(screen.getByRole('button', { name: /Huffman/ }));
  for (let step = 0; step < merges; step += 1) {
    const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Fundir nós selecionados' }));
  }
  await user.click(screen.getByRole('button', { name: 'Confirmar árvore e continuar' }));
  await user.click(screen.getByRole('button', { name: /Scheduler/ }));
  await user.click(screen.getByRole('button', { name: 'Aplicar ordem EDD' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar ordem e transmitir' }));
  await user.click(screen.getByRole('button', { name: 'Concluir transmissão' }));
}

afterEach(() => vi.restoreAllMocks());

describe('coleção de missões e progressão', () => {
  it('lista as missões oficiais e libera apenas a primeira', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openMode(user, 'Missões');

    const campaign = screen.getByRole('list', { name: 'Campanha' });
    expect(within(campaign).getAllByRole('heading', { level: 4 })).toHaveLength(
      officialMissions.length,
    );
    expect(screen.getByText(/0 de 4 missões oficiais concluídas/)).toBeVisible();
    expect(screen.getByRole('button', { name: `Abrir missão: ${alpha.title}` })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    const locked = screen.getByRole('button', { name: `Abrir missão: ${tiedOrbit.title}` });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveAccessibleDescription(new RegExp(`conclua “${alpha.title}”`));
    await user.click(locked);
    expect(screen.getByRole('heading', { name: 'Missões' })).toBeVisible();
    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(alpha.title);
  });

  it('concluir a missão registra as marcas e libera a seguinte', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeCurrentMission(user, alpha.telemetry.referenceMergeHistory.length);

    expect(screen.getByText(/Resultado registrado neste navegador/)).toHaveTextContent(
      `Próxima missão liberada: ${tiedOrbit.title}.`,
    );
    // Concluir não troca a tela: o relatório da missão encerrada continua acessível.
    expect(screen.getByRole('button', { name: /Relatório/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Ver missões' }));
    const card = within(missionCard(alpha.title));
    expect(card.getByText('✔ Concluída 1×.')).toBeVisible();
    expect(card.getByText('✔ Árvore com o custo de Huffman')).toBeVisible();
    expect(card.getByText('✔ Atraso máximo igual ao de EDD')).toBeVisible();
    expect(screen.getByText(/1 de 4 missões oficiais concluídas/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: `Abrir missão: ${tiedOrbit.title}` }));
    expect(screen.getByRole('heading', { level: 3, name: tiedOrbit.title })).toBeVisible();
    expect(screen.getByText(tiedOrbit.briefing)).toBeVisible();
    expect(screen.getByText('Aguardando autorização')).toBeVisible();
    expect(storedProgress().lastMissionId).toBe(tiedOrbit.id);
  }, 20_000);

  it('é possível concluir uma missão com outro alfabeto, banda e número de pacotes', async () => {
    seedProgress(recordMissionCompletion(createEmptyProgress(), buildMissionReport(alpha)));
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { level: 3, name: tiedOrbit.title })).toBeVisible();
    await completeCurrentMission(user, tiedOrbit.telemetry.referenceMergeHistory.length);

    expect(screen.getByText('Missão concluída')).toBeVisible();
    expect(screen.getByText(/Resultado registrado/)).toHaveTextContent(solarStorm.title);
    expect(Object.keys(storedProgress().results)).toEqual([alpha.id, tiedOrbit.id]);
  }, 20_000);

  it('jogar novamente recomeça do briefing sem perder as marcas', async () => {
    let progress = recordMissionCompletion(createEmptyProgress(), buildMissionReport(alpha));
    progress = saveSession(progress, playUntil(alpha, 'report'));
    seedProgress(selectMission(progress, alpha.id));
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Missão concluída')).toBeVisible();
    await openMode(user, 'Missões');
    await user.click(screen.getByRole('button', { name: `Jogar novamente: ${alpha.title}` }));

    expect(screen.getByRole('button', { name: 'Iniciar missão' })).toBeVisible();
    expect(storedProgress().results[alpha.id]?.completions).toBe(1);
  });
});

describe('progresso salvo localmente', () => {
  it('retoma a tentativa em andamento depois de recarregar a página', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));
    await user.click(screen.getByRole('button', { name: /Telemetria/ }));
    await user.click(screen.getByRole('button', { name: 'Concluir investigação' }));
    await user.click(screen.getByRole('button', { name: /Huffman/ }));
    const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Fundir nós selecionados' }));
    first.unmount();

    render(<App />);
    expect(screen.getByText('Compressão Huffman')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Huffman/ }));
    expect(screen.getByText(/Fusão 1:/)).toBeVisible();

    await openMode(user, 'Missões');
    expect(
      within(missionCard(alpha.title)).getByText(/Em andamento — fase de compressão/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: `Continuar missão: ${alpha.title}` })).toBeVisible();
  });

  it('restaura missões concluídas e a missão atual ao abrir a aplicação', () => {
    let progress = recordMissionCompletion(createEmptyProgress(), buildMissionReport(alpha));
    progress = saveSession(progress, playUntil(tiedOrbit, 'scheduling'));
    seedProgress(selectMission(progress, tiedOrbit.id));
    render(<App />);

    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(tiedOrbit.title);
    expect(screen.getByText('Escalonamento EDD')).toBeVisible();
    expect(screen.getByRole('button', { name: /Scheduler/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it.each(['{ corrompido', '{"schemaVersion":99}', '"texto"'])(
    'começa do zero quando o dado salvo é %s',
    (stored) => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, stored);
      render(<App />);

      expect(screen.getByRole('button', { name: 'Iniciar missão' })).toBeVisible();
      expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(alpha.title);
    },
  );

  it('ignora uma tentativa salva que a missão não poderia produzir', () => {
    const tampered = {
      ...saveSession(createEmptyProgress(), playUntil(alpha, 'scheduling')),
      lastMissionId: solarStorm.id,
    };
    localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({
        ...tampered,
        sessions: { [alpha.id]: { ...tampered.sessions[alpha.id], huffmanMergeChoices: [] } },
      }),
    );
    render(<App />);

    // Fase de escalonamento sem árvore é inconsistente; missão bloqueada não pode ser a atual.
    expect(screen.getByText('Aguardando autorização')).toBeVisible();
    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(alpha.title);
  });

  it('apaga o progresso da campanha somente após confirmação e mantém os cenários importados', async () => {
    const added = addCustomMission(
      recordMissionCompletion(createEmptyProgress(), buildMissionReport(alpha)),
      officialMissions,
      createCustomDefinition(),
    );
    if (!added.ok) throw new Error(added.message);
    seedProgress(selectMission(added.progress, tiedOrbit.id));
    const user = userEvent.setup();
    render(<App />);
    await openMode(user, 'Missões');

    await user.click(screen.getByRole('button', { name: 'Apagar progresso da campanha' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/1 de 4 missões oficiais concluídas/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Apagar progresso da campanha' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e apagar' }));

    expect(screen.getByText(/0 de 4 missões oficiais concluídas/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Abrir missão: ${tiedOrbit.title}` }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(alpha.title);
    expect(screen.getByRole('button', { name: 'Apagar progresso da campanha' })).toBeDisabled();
    expect(storedProgress()).toEqual({
      ...createEmptyProgress(),
      customMissions: [createCustomDefinition()],
    });
  });

  it('avisa quando o navegador recusa a gravação e continua jogável', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota excedida', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar o progresso');
    expect(screen.getByText('Investigação de telemetria')).toBeVisible();
  });
});

describe('cenários importados na coleção', () => {
  it('importa um cenário pelo editor e permite jogá-lo sem depender da campanha', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openMode(user, 'Editor de cenários');

    await user.click(screen.getByLabelText('Documento JSON da missão'));
    await user.paste(serializeMission(createCustomDefinition()));
    await user.click(screen.getByRole('button', { name: 'Adicionar à coleção' }));
    expect(storedProgress().customMissions).toEqual([createCustomDefinition()]);

    await user.click(screen.getByRole('button', { name: 'Jogar este cenário' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Retransmissor de teste' })).toBeVisible();

    await completeCurrentMission(user, 1);
    expect(screen.getByText(/Resultado registrado/)).toHaveTextContent(
      'Você pode repetir a missão',
    );

    await openMode(user, 'Missões');
    const imported = screen.getByRole('list', { name: 'Cenários importados' });
    expect(within(imported).getByText('✔ Concluída 1×.')).toBeVisible();
    // Um cenário importado não conta para a campanha nem libera missões oficiais.
    expect(screen.getByText(/0 de 4 missões oficiais concluídas/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Abrir missão: ${tiedOrbit.title}` }),
    ).toHaveAttribute('aria-disabled', 'true');
  }, 20_000);

  it('remover o cenário ativo devolve a sala de controle à campanha', async () => {
    const added = addCustomMission(
      createEmptyProgress(),
      officialMissions,
      createCustomDefinition(),
    );
    if (!added.ok) throw new Error(added.message);
    seedProgress(selectMission(added.progress, 'custom-relay'));
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(
      'Retransmissor de teste',
    );

    await openMode(user, 'Editor de cenários');
    await user.click(screen.getByRole('button', { name: 'Remover Retransmissor de teste' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar remoção de Retransmissor de teste' }),
    );

    expect(screen.getByText('Nenhum cenário importado neste navegador.')).toBeVisible();
    expect(screen.getByText('Missão').nextElementSibling).toHaveTextContent(alpha.title);
    expect(storedProgress().customMissions).toEqual([]);
  });
});
