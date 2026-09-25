// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { countFrequencies } from '../algorithms/huffman';
import { deepSpaceMission } from '../data';
import { InvalidMissionError, loadMission } from './index';
import type { MissionDefinition } from './types';

const validDefinition = (): MissionDefinition => ({
  id: 'test-mission',
  title: 'Missão de teste',
  briefing: 'Transmita a telemetria.',
  objectives: ['Entregar todos os pacotes.'],
  bandwidthBitsPerTimeUnit: 8,
  telemetry: {
    alphabet: [
      { value: 0, label: 'zero' },
      { value: 1, label: 'um' },
    ],
    originalFormat: { encoding: 'unsigned-integer', bitsPerSymbol: 8, sizeUnit: 'bit' },
  },
  packets: [{ id: 'packet-a', deadline: 10, payload: [0, 0, 0, 1] }],
});

describe('loadMission', () => {
  it('carrega o cenário declarativo com briefing, objetivos e seis pacotes', () => {
    const mission = loadMission(deepSpaceMission);

    expect(mission.id).toBe('deep-space-alpha');
    expect(mission.briefing.length).toBeGreaterThan(0);
    expect(mission.objectives).toHaveLength(3);
    expect(mission.packets).toHaveLength(6);
    expect(mission.telemetry.originalFormat).toEqual({
      encoding: 'unsigned-integer',
      bitsPerSymbol: 8,
      sizeUnit: 'bit',
    });
  });

  it('deriva as frequências da concatenação dos payloads', () => {
    const mission = loadMission(deepSpaceMission);
    const corpus = Uint8Array.from(deepSpaceMission.packets.flatMap((packet) => packet.payload));

    expect(mission.telemetry.frequencies).toEqual(countFrequencies(corpus));
    expect(mission.telemetry.tree.weight).toBe(corpus.length);
  });

  it('usa uma única árvore e produz diferenças observáveis com a compressão', () => {
    const mission = loadMission(deepSpaceMission);
    const originalBits = mission.packets.reduce(
      (total, packet) => total + packet.originalBitLength,
      0,
    );
    const compressedBits = mission.packets.reduce(
      (total, packet) => total + packet.compressedBitLength,
      0,
    );

    expect(mission.telemetry.sharedHeaderBitLength).toBeGreaterThan(0);
    expect(compressedBits).toBeLessThan(originalBits);
    expect(
      mission.packets.some((packet) => packet.compressedBitLength < packet.originalBitLength),
    ).toBe(true);
    expect(
      mission.packets.some(
        (packet) => packet.compressedTransmissionTime !== packet.originalTransmissionTime,
      ),
    ).toBe(true);
  });

  it('rejeita IDs inválidos ou duplicados', () => {
    const invalidMissionId = { ...validDefinition(), id: 'ID inválido' };
    const invalidPacketId = {
      ...validDefinition(),
      packets: [{ id: '', deadline: 1, payload: [0] }],
    };
    const definition = validDefinition();
    const duplicatePacketId = {
      ...definition,
      packets: [...definition.packets, { id: 'packet-a', deadline: 2, payload: [1] }],
    };

    expect(() => loadMission(invalidMissionId)).toThrowError(InvalidMissionError);
    expect(() => loadMission(invalidPacketId)).toThrowError(InvalidMissionError);
    expect(() => loadMission(duplicatePacketId)).toThrowError(InvalidMissionError);
  });

  it('rejeita banda e deadlines inválidos', () => {
    const invalidBandwidth = { ...validDefinition(), bandwidthBitsPerTimeUnit: 0 };
    const invalidDeadline = {
      ...validDefinition(),
      packets: [{ id: 'packet-a', deadline: Number.NaN, payload: [0] }],
    };

    expect(() => loadMission(invalidBandwidth)).toThrowError(InvalidMissionError);
    expect(() => loadMission(invalidDeadline)).toThrowError(InvalidMissionError);
  });

  it('rejeita payloads vazios, fora do alfabeto ou não inteiros', () => {
    for (const payload of [[], [2], [0.5]]) {
      const definition = {
        ...validDefinition(),
        packets: [{ id: 'packet-a', deadline: 1, payload }],
      };

      expect(() => loadMission(definition)).toThrowError(InvalidMissionError);
    }
  });
});
