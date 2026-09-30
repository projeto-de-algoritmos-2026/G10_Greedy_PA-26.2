// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { packCodes } from '../algorithms/huffman';
import { deepSpaceMission } from '../data';
import { analyzeMissionTransmission, loadMission } from './index';

describe('analyzeMissionTransmission', () => {
  it('aplica a tabela compartilhada e separa payload, padding, cabeçalho e total', () => {
    const mission = loadMission(deepSpaceMission);
    const analysis = analyzeMissionTransmission(mission);

    for (const [index, packet] of mission.packets.entries()) {
      const compressed = analysis.compressed.packets[index];
      const packed = packCodes(packet.payload, mission.telemetry.codeTable);
      expect(compressed).toBeDefined();
      if (compressed === undefined) throw new Error('Pacote comprimido ausente.');
      expect(compressed.bits).toEqual({
        headerBitLength: 0,
        payloadBitLength: packed.bitLength,
        paddingBitLength: packed.paddingBits,
        totalBitLength: packed.bitLength + packed.paddingBits,
      });
      expect(compressed.bits.totalBitLength % 8).toBe(0);
    }

    const packetBits = analysis.compressed.packets.reduce(
      (total, packet) => total + packet.bits.totalBitLength,
      0,
    );
    expect(analysis.compressed.totals.headerBitLength).toBe(
      mission.telemetry.sharedHeaderBitLength,
    );
    expect(analysis.compressed.totals.totalBitLength).toBe(
      mission.telemetry.sharedHeaderBitLength + packetBits,
    );
  });

  it('calcula toda duração exclusivamente como bits divididos pela largura de banda', () => {
    const mission = loadMission(deepSpaceMission);
    const analysis = analyzeMissionTransmission(mission);

    for (const scenario of [analysis.original, analysis.compressed]) {
      expect(scenario.headerTransmissionTime).toBe(
        scenario.totals.headerBitLength / mission.bandwidthBitsPerTimeUnit,
      );
      expect(scenario.totalTransmissionTime).toBe(
        scenario.totals.totalBitLength / mission.bandwidthBitsPerTimeUnit,
      );
      for (const packet of scenario.packets) {
        expect(packet.transmissionTime).toBe(
          packet.bits.totalBitLength / mission.bandwidthBitsPerTimeUnit,
        );
      }
    }
  });

  it('produz o mesmo resultado para as mesmas entradas', () => {
    const mission = loadMission(deepSpaceMission);

    expect(analyzeMissionTransmission(mission)).toEqual(analyzeMissionTransmission(mission));
  });
});
