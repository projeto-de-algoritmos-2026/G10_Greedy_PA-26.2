import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

async function reachScheduler(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Iniciar missão' }));
  await user.click(screen.getByRole('button', { name: /Telemetria/ }));
  await user.click(screen.getByRole('button', { name: 'Concluir investigação' }));
  await user.click(screen.getByRole('button', { name: /Huffman/ }));
  await user.click(screen.getByRole('button', { name: /árvore de referência/ }));
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
  });

  it('alcança todos os terminais por teclado e explica os bloqueados', async () => {
    const user = userEvent.setup();
    render(<App />);

    const names = ['Telemetria', 'Huffman', 'Scheduler', 'Relatório'];
    for (const name of names) {
      const hotspot = screen.getByRole('button', { name: new RegExp(name) });
      await user.tab();
      // Tab percorre "Iniciar missão" e depois cada terminal, na ordem do DOM.
      if (name === 'Telemetria') await user.tab();
      expect(hotspot).toHaveFocus();
      expect(hotspot).toHaveAttribute('aria-disabled', 'true');
      expect(hotspot).toHaveAccessibleDescription(/liberar/);
    }
  });

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
});
