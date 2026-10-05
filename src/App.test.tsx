import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

async function enterCompression(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));
  await user.click(screen.getByRole('button', { name: /Telemetria/ }));
  await user.click(screen.getByRole('button', { name: 'Concluir investigação' }));
  await user.click(screen.getByRole('button', { name: /Huffman/ }));
}

async function activateWithKeyboard(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  button.focus();
  expect(button).toHaveFocus();
  await user.keyboard('{Enter}');
}

async function completeGreedyHuffman(user: ReturnType<typeof userEvent.setup>) {
  for (let step = 0; step < 5; step += 1) {
    const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Fundir nós selecionados' }));
  }
}

async function reachScheduler(user: ReturnType<typeof userEvent.setup>) {
  await enterCompression(user);
  await completeGreedyHuffman(user);
  await user.click(screen.getByRole('button', { name: 'Confirmar árvore e continuar' }));
  await user.click(screen.getByRole('button', { name: /Scheduler/ }));
}

const orderIds = () =>
  within(screen.getByRole('list', { name: /Ordem de transmissão/ }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.match(/\d\. (\w+)/)?.[1]);

describe('App', () => {
  it('exibe o título do jogo', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'DeepSpace: Mission Control' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo principal' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByText('Fase')).toBeVisible();
    expect(screen.getByText('Aguardando autorização')).toBeVisible();
  });

  it('move o foco ao abrir e fechar um terminal', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));
    const telemetry = screen.getByRole('button', { name: /Telemetria/ });
    await user.click(telemetry);

    expect(screen.getByLabelText('Terminal aberto: Telemetria')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Voltar à sala de controle/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(telemetry).toHaveFocus();
  });

  it('alcança todos os terminais por teclado e explica os bloqueados', async () => {
    const user = userEvent.setup();
    render(<App />);

    const names = ['Telemetria', 'Huffman', 'Scheduler', 'Relatório'];
    await user.tab();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo principal' })).toHaveFocus();
    const modes = within(screen.getByRole('navigation', { name: 'Modos da aplicação' }));
    for (const mode of ['Sala de controle', 'Missões', 'Laboratório', 'Editor de cenários']) {
      await user.tab();
      expect(modes.getByRole('button', { name: mode })).toHaveFocus();
    }
    await user.tab();
    expect(screen.getByRole('button', { name: 'Iniciar missão' })).toHaveFocus();
    for (const name of names) {
      const hotspot = screen.getByRole('button', { name: new RegExp(name) });
      await user.tab();
      expect(hotspot).toHaveFocus();
      expect(hotspot).toHaveAttribute('aria-disabled', 'true');
      expect(hotspot).toHaveAccessibleDescription(/liberar/);
    }
  });

  it('permite concluir o fluxo inteiro usando somente o teclado', async () => {
    const user = userEvent.setup();
    render(<App />);

    await activateWithKeyboard(user, screen.getByRole('button', { name: 'Iniciar missão' }));
    await activateWithKeyboard(user, screen.getByRole('button', { name: /Telemetria/ }));
    await activateWithKeyboard(user, screen.getByRole('button', { name: 'Concluir investigação' }));
    await activateWithKeyboard(user, screen.getByRole('button', { name: /Huffman/ }));

    for (let step = 0; step < 5; step += 1) {
      const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
      await activateWithKeyboard(
        user,
        within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!,
      );
      await activateWithKeyboard(
        user,
        within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!,
      );
      await activateWithKeyboard(
        user,
        screen.getByRole('button', { name: 'Fundir nós selecionados' }),
      );
    }

    await activateWithKeyboard(
      user,
      screen.getByRole('button', { name: 'Confirmar árvore e continuar' }),
    );
    await activateWithKeyboard(user, screen.getByRole('button', { name: /Scheduler/ }));
    await activateWithKeyboard(
      user,
      screen.getByRole('button', { name: 'Confirmar ordem e transmitir' }),
    );
    await activateWithKeyboard(user, screen.getByRole('button', { name: 'Concluir transmissão' }));
    await activateWithKeyboard(user, screen.getByRole('button', { name: /Relatório/ }));

    expect(screen.getByRole('heading', { name: 'Relatório da missão' })).toBeVisible();
    expect(screen.getByText('Missão concluída')).toBeVisible();
  }, 15_000);

  it('mantém o estado da missão ao trocar de terminal', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachScheduler(user);

    await user.click(screen.getByRole('button', { name: 'Aplicar ordem EDD' }));
    const before = orderIds();
    await user.click(screen.getByRole('button', { name: /Voltar/ }));
    await user.click(screen.getByRole('button', { name: /Huffman/ }));
    await user.click(screen.getByRole('button', { name: /Voltar/ }));
    await user.click(screen.getByRole('button', { name: /Scheduler/ }));

    expect(orderIds()).toEqual(before);
    expect(screen.getByRole('button', { name: /Scheduler/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('avisa sobre escolha fora da regra sem antecipar o custo da árvore', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterCompression(user);

    await user.click(screen.getByRole('button', { name: /Selecionar nominal/ }));
    await user.click(screen.getByRole('button', { name: /Selecionar temperatura-alta/ }));

    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent('Escolha fora da regra de Huffman');
    expect(warning).toHaveTextContent('somente depois que todas as fusões terminarem');
    expect(warning).not.toHaveTextContent(/subótim|custo maior/i);
    expect(screen.getByRole('button', { name: 'Continuar com a fusão' })).toBeEnabled();
  });

  it('permite revisar e desfazer cada fusão e oferece alternativa textual da árvore', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterCompression(user);

    const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Fundir nós selecionados' }));

    expect(screen.getByText(/Fusão 1:/).closest('li')).toHaveTextContent(
      'Seguiu a regra de Huffman',
    );
    await user.click(screen.getByRole('button', { name: 'Revisar fusão 1' }));
    expect(screen.getByRole('img', { name: /Árvore de Huffman/ })).toBeVisible();
    expect(screen.getByText('Alternativa textual da árvore')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Desfazer última fusão' }));
    expect(screen.getByText('Nenhuma fusão realizada.')).toBeVisible();
  });

  it('exibe códigos e custo somente após completar a árvore', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterCompression(user);

    expect(screen.queryByText('Códigos e comparação final')).not.toBeInTheDocument();
    await completeGreedyHuffman(user);

    expect(screen.getByText('Códigos e comparação final')).toBeVisible();
    expect(screen.getByText('Tabela de códigos da árvore do jogador')).toBeVisible();
    expect(screen.getByText(/mesmo custo da referência/)).toBeVisible();
  });

  it('reordenar por botão atualiza métricas e EDD as iguala à referência', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachScheduler(user);

    await user.click(screen.getByRole('button', { name: 'Aplicar ordem EDD' }));
    expect(orderIds()).toEqual(['sync', 'radiation', 'power', 'thermal', 'pressure', 'navigation']);
    expect(screen.getByRole('status')).toHaveTextContent('mesmo atraso máximo');

    await user.click(screen.getByRole('button', { name: 'Mover sync para baixo' }));
    expect(orderIds()[0]).toBe('radiation');
    expect(screen.getByRole('button', { name: 'Aplicar ordem EDD' })).toBeEnabled();
  });

  it('comunica atraso por texto, não só por cor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachScheduler(user);

    const manualChart = screen.getByText(/^Ordem manual —/).closest('figure');
    if (manualChart === null) throw new Error('Gantt manual ausente.');
    const lateBars = within(manualChart).queryAllByRole('img', { name: /atrasado em/ });
    const lateRows = screen.queryAllByText(/⚠ Atrasado/);

    expect(lateBars.length).toBeGreaterThan(0);
    expect(lateBars).toHaveLength(lateRows.length);
    for (const bar of lateBars) expect(bar).toHaveTextContent(/⚠ \+/);
  });

  it('consolida o relatório final e permite reiniciar a missão', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachScheduler(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar ordem e transmitir' }));
    await user.click(screen.getByRole('button', { name: 'Concluir transmissão' }));
    await user.click(screen.getByRole('button', { name: /Relatório/ }));

    expect(screen.getByRole('heading', { name: 'Relatório da missão' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Original × comprimido' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Jogador × Huffman' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ordem manual × EDD' })).toBeVisible();
    expect(screen.getByText('Payload e custo efetivo da transmissão')).toBeVisible();
    expect(screen.getByText(/mesmo custo da referência/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reiniciar missão' }));
    expect(screen.getByRole('button', { name: 'Iniciar missão' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Relatório/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('heading', { name: 'Relatório da missão' })).not.toBeInTheDocument();
  });

  it('mantém o Scheduler como terminal disponível até a transmissão ser concluída', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachScheduler(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar ordem e transmitir' }));
    await user.click(screen.getByRole('button', { name: /Voltar à sala de controle/ }));

    // Na fase de transmissão o passo pendente ("Concluir transmissão") está no Scheduler.
    const scheduler = screen.getByRole('button', { name: /Scheduler/ });
    expect(scheduler).toHaveTextContent('Disponível');
    expect(scheduler).not.toHaveTextContent('Concluído');

    await user.click(scheduler);
    await user.click(screen.getByRole('button', { name: 'Concluir transmissão' }));
    await user.click(screen.getByRole('button', { name: /Voltar à sala de controle/ }));
    expect(screen.getByRole('button', { name: /Scheduler/ })).toHaveTextContent('Concluído');
  });

  it('reinicia a sessão da missão pela sala de controle, com confirmação', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.queryByRole('button', { name: 'Reiniciar sessão da missão' }),
    ).not.toBeInTheDocument();

    await enterCompression(user);
    const heap = screen.getByRole('list', { name: /Min-heap de candidatos/ });
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(within(heap).getAllByRole('button', { name: /^Selecionar / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Fundir nós selecionados' }));
    // Uma seleção pendente referencia nós que deixam de existir após o reinício.
    await user.click(
      within(screen.getByRole('list', { name: /Min-heap de candidatos/ })).getAllByRole('button', {
        name: /^Selecionar /,
      })[0]!,
    );

    await user.click(screen.getByRole('button', { name: 'Reiniciar sessão da missão' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { name: 'Terminal Huffman' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reiniciar sessão da missão' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar reinício' }));

    expect(screen.getByRole('button', { name: 'Iniciar missão' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Terminal Huffman' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Telemetria/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(localStorage.getItem('deepspace-mission-control:progress')).not.toContain(
      'huffmanMergeChoices',
    );
  });
});
