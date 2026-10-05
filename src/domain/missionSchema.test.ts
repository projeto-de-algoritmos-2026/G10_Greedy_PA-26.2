// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { InvalidMissionError, loadMission } from './index';
import {
  MISSION_LIMITS,
  parseMissionJson,
  serializeMission,
  validateMissionDocument,
} from './missionSchema';
import type { MissionDefinition } from './types';

const validDocument = () => ({
  schemaVersion: 1,
  id: 'test-mission',
  title: 'Missão de teste',
  briefing: 'Transmita a telemetria.',
  objectives: ['Entregar todos os pacotes.'],
  bandwidthBitsPerTimeUnit: 8,
  telemetry: {
    alphabet: [
      { value: 0, label: 'zero' },
      { value: 1, label: 'um' },
      { value: 2, label: 'dois' },
    ],
    originalFormat: { encoding: 'unsigned-integer', bitsPerSymbol: 8, sizeUnit: 'bit' },
  },
  packets: [
    { id: 'packet-a', deadline: 10, payload: [0, 0, 0, 1] },
    { id: 'packet-b', deadline: 4, payload: [2, 0, 1] },
  ],
});

type Document = ReturnType<typeof validDocument>;

/** Aplica uma alteração ao documento válido e devolve os caminhos dos problemas reportados. */
function issuePaths(mutate: (document: Document) => unknown): readonly string[] {
  const document = validDocument();
  const result = validateMissionDocument(mutate(document) ?? document);
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe('validateMissionDocument', () => {
  it('aceita um documento válido e devolve uma definição imutável e normalizada', () => {
    const result = validateMissionDocument(validDocument());

    expect(result).toEqual({ ok: true, definition: validDocument() });
    if (!result.ok) throw new Error('documento deveria ser válido');
    expect(Object.isFrozen(result.definition)).toBe(true);
    expect(Object.isFrozen(result.definition.packets[0]?.payload)).toBe(true);
  });

  it('exige uma versão de schema conhecida antes de interpretar o restante', () => {
    const missing = validateMissionDocument({ ...validDocument(), schemaVersion: undefined });
    const future = validateMissionDocument({ ...validDocument(), schemaVersion: 2, id: '!!' });

    expect(missing).toMatchObject({ ok: false, issues: [{ path: 'schemaVersion' }] });
    expect(future).toMatchObject({ ok: false, issues: [{ path: 'schemaVersion' }] });
    if (future.ok) throw new Error('versão futura deveria ser rejeitada');
    expect(future.issues).toHaveLength(1);
    expect(future.issues[0]?.message).toContain('versão 2 não suportada');
  });

  it.each([null, 'texto', 42, [], undefined])('rejeita a raiz %j', (input) => {
    expect(validateMissionDocument(input).ok).toBe(false);
  });

  it('rejeita campos desconhecidos em todos os níveis', () => {
    expect(issuePaths((doc) => ({ ...doc, difficulty: 'hard' }))).toEqual(['missão.difficulty']);
    expect(issuePaths((doc) => ({ ...doc, telemetry: { ...doc.telemetry, noise: 1 } }))).toEqual([
      'telemetry.noise',
    ]);
    expect(
      issuePaths((doc) => {
        Object.assign(doc.telemetry.alphabet[0]!, { color: 'red' });
      }),
    ).toEqual(['telemetry.alphabet[0].color']);
  });

  it.each(['releaseTime', 'priority', 'weight', 'preemptive'])(
    'recusa o atributo de escalonamento "%s" em vez de tratá-lo como EDD',
    (key) => {
      const document = validDocument();
      Object.assign(document.packets[1]!, { [key]: 1 });
      const result = validateMissionDocument(document);

      expect(result).toMatchObject({ ok: false, issues: [{ path: `packets[1].${key}` }] });
      if (result.ok) throw new Error('atributo deveria ser rejeitado');
      expect(result.issues[0]?.message).toContain('não EDD');
    },
  );

  it('rejeita identificadores, textos e objetivos inválidos', () => {
    expect(issuePaths((doc) => ({ ...doc, id: 'ID Inválido' }))).toEqual(['id']);
    expect(issuePaths((doc) => ({ ...doc, id: 'a'.repeat(49) }))).toEqual(['id']);
    expect(issuePaths((doc) => ({ ...doc, title: '   ' }))).toEqual(['title']);
    expect(issuePaths((doc) => ({ ...doc, title: 't'.repeat(81) }))).toEqual(['title']);
    expect(issuePaths((doc) => ({ ...doc, briefing: 7 }))).toEqual(['briefing']);
    expect(issuePaths((doc) => ({ ...doc, objectives: [] }))).toEqual(['objectives']);
    expect(issuePaths((doc) => ({ ...doc, objectives: ['a', ''] }))).toEqual(['objectives[1]']);
    expect(issuePaths((doc) => ({ ...doc, objectives: ['a', 'a'] }))).toEqual(['objectives[1]']);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '16', 1_000_001])(
    'rejeita a largura de banda %j',
    (bandwidth) => {
      expect(issuePaths((doc) => ({ ...doc, bandwidthBitsPerTimeUnit: bandwidth }))).toEqual([
        'bandwidthBitsPerTimeUnit',
      ]);
    },
  );

  it('rejeita formato original inválido', () => {
    const withFormat = (format: Record<string, unknown>) =>
      issuePaths((doc) => ({
        ...doc,
        telemetry: {
          ...doc.telemetry,
          originalFormat: { ...doc.telemetry.originalFormat, ...format },
        },
      }));

    expect(withFormat({ encoding: 'float' })).toEqual(['telemetry.originalFormat.encoding']);
    expect(withFormat({ sizeUnit: 'byte' })).toEqual(['telemetry.originalFormat.sizeUnit']);
    expect(withFormat({ bitsPerSymbol: 0 })).toEqual(['telemetry.originalFormat.bitsPerSymbol']);
    expect(withFormat({ bitsPerSymbol: 33 })).toEqual(['telemetry.originalFormat.bitsPerSymbol']);
    expect(withFormat({ bitsPerSymbol: 2.5 })).toEqual(['telemetry.originalFormat.bitsPerSymbol']);
  });

  it('rejeita símbolo que não cabe nos bits declarados para o formato original', () => {
    const paths = issuePaths((doc) => {
      doc.telemetry.originalFormat.bitsPerSymbol = 1;
    });

    expect(paths).toEqual(['telemetry.alphabet[2].value']);
  });

  it('rejeita alfabeto pequeno, grande, duplicado ou fora do intervalo de byte', () => {
    const withAlphabet = (alphabet: unknown) =>
      issuePaths((doc) => ({ ...doc, telemetry: { ...doc.telemetry, alphabet } }));
    const oversized = Array.from({ length: MISSION_LIMITS.maxAlphabetSize + 1 }, (_, value) => ({
      value,
      label: `s${value}`,
    }));

    expect(withAlphabet([{ value: 0, label: 'zero' }])).toContain('telemetry.alphabet');
    expect(withAlphabet(oversized)).toContain('telemetry.alphabet');
    expect(
      issuePaths((doc) => {
        doc.telemetry.alphabet[1]!.value = 0;
      }),
    ).toContain('telemetry.alphabet[1].value');
    expect(
      issuePaths((doc) => {
        doc.telemetry.alphabet[1]!.label = 'zero';
      }),
    ).toEqual(['telemetry.alphabet[1].label']);
    expect(
      issuePaths((doc) => {
        doc.telemetry.alphabet[2]!.value = 256;
      }),
    ).toContain('telemetry.alphabet[2].value');
  });

  it('rejeita símbolo declarado que nunca é transmitido', () => {
    const paths = issuePaths((doc) => {
      doc.packets[1]!.payload = [0, 1];
    });

    expect(paths).toEqual(['telemetry.alphabet[2]']);
  });

  it('rejeita pacotes com id, deadline ou payload inconsistentes', () => {
    const withPacket = (packet: Record<string, unknown>) =>
      issuePaths((doc) => {
        Object.assign(doc.packets[1]!, packet);
      });

    expect(withPacket({ id: 'packet-a' })).toEqual(['packets[1].id']);
    expect(withPacket({ id: '' })).toEqual(['packets[1].id']);
    expect(withPacket({ deadline: -1 })).toEqual(['packets[1].deadline']);
    expect(withPacket({ deadline: Number.NaN })).toEqual(['packets[1].deadline']);
    expect(withPacket({ deadline: '4' })).toEqual(['packets[1].deadline']);
    expect(withPacket({ payload: [] })).toContain('packets[1].payload');
    expect(withPacket({ payload: [2, 0, 9] })).toContain('packets[1].payload[2]');
    expect(withPacket({ payload: [2, 0.5, 1] })).toContain('packets[1].payload[1]');
    expect(withPacket({ payload: 'abc' })).toContain('packets[1].payload');
    expect(issuePaths((doc) => ({ ...doc, packets: [] }))).toContain('packets');
  });

  it('aplica limites de quantidade de pacotes e de símbolos', () => {
    const manyPackets = Array.from({ length: MISSION_LIMITS.maxPackets + 1 }, (_, index) => ({
      id: `p-${index}`,
      deadline: index,
      payload: [0, 1, 2],
    }));
    const longPayload = Array.from({ length: MISSION_LIMITS.maxPayloadSymbols + 1 }, () => 0);
    const fullPayload = Array.from({ length: MISSION_LIMITS.maxPayloadSymbols }, () => 0);
    const tooManySymbols = Array.from({ length: 5 }, (_, index) => ({
      id: `p-${index}`,
      deadline: index,
      payload: index === 0 ? [...fullPayload.slice(3), 0, 1, 2] : fullPayload,
    }));

    expect(issuePaths((doc) => ({ ...doc, packets: manyPackets }))).toContain('packets');
    expect(
      issuePaths((doc) => {
        doc.packets[0]!.payload = longPayload;
      }),
    ).toContain('packets[0].payload');
    expect(issuePaths((doc) => ({ ...doc, packets: tooManySymbols }))).toEqual(['packets']);
  });

  it('reporta todos os problemas de uma vez', () => {
    const paths = issuePaths((doc) => ({
      ...doc,
      title: '',
      bandwidthBitsPerTimeUnit: 0,
      packets: [{ id: 'packet-a', deadline: -5, payload: [0, 1, 2] }],
    }));

    expect(paths).toEqual(['title', 'bandwidthBitsPerTimeUnit', 'packets[0].deadline']);
  });
});

describe('parseMissionJson e serializeMission', () => {
  it('reporta JSON vazio, malformado ou grande demais', () => {
    expect(parseMissionJson('   ')).toMatchObject({ ok: false, issues: [{ path: 'missão' }] });
    expect(parseMissionJson('{ "id": ')).toMatchObject({ ok: false });
    expect(parseMissionJson(' '.repeat(MISSION_LIMITS.maxDocumentLength) + '{}')).toMatchObject({
      ok: false,
    });
    const malformed = parseMissionJson('{ "id": ');
    if (malformed.ok) throw new Error('JSON malformado deveria ser rejeitado');
    expect(malformed.issues[0]?.message).toContain('JSON inválido');
  });

  it('exporta com payload em uma linha e reimporta a mesma definição', () => {
    const definition = validDocument() as MissionDefinition;
    const text = serializeMission(definition);

    expect(text).toContain('"payload": [0, 0, 0, 1]');
    expect(text.indexOf('"schemaVersion"')).toBeLessThan(text.indexOf('"id"'));
    expect(parseMissionJson(text)).toEqual({ ok: true, definition });
  });
});

describe('loadMission com o schema', () => {
  it('lança InvalidMissionError com a lista completa de problemas', () => {
    const invalid = {
      ...validDocument(),
      title: '',
      bandwidthBitsPerTimeUnit: 0,
    } as unknown as MissionDefinition;

    expect(() => loadMission(invalid)).toThrowError(InvalidMissionError);
    try {
      loadMission(invalid);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMissionError);
      expect((error as InvalidMissionError).issues.map((issue) => issue.path)).toEqual([
        'title',
        'bandwidthBitsPerTimeUnit',
      ]);
      expect((error as InvalidMissionError).message).toContain('title');
    }
  });
});
