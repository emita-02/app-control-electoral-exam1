import assert from 'node:assert/strict';
import test from 'node:test';

import { createPollingPlace } from './create-polling-place.ts';

const baseInput = {
  parishId: 7,
  name: '  Recinto Central  ',
  code: '  RC-01  ',
  address: '  Calle 1  ',
  tableCount: 3,
};

function repositoryDouble() {
  const calls = [];
  return {
    calls,
    repository: {
      async findByProvinceId() {
        throw new Error('no usado en esta prueba');
      },
      async createPollingPlace(input) {
        calls.push(input);
        return {
          id: 1,
          code: input.code,
          name: input.name,
          address: input.address,
          electoralTables: [],
        };
      },
    },
  };
}

test('normaliza el recinto y envía la cantidad de mesas al repositorio', async () => {
  const { calls, repository } = repositoryDouble();
  const created = await createPollingPlace(repository, baseInput);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    parishId: 7,
    name: 'Recinto Central',
    code: 'RC-01',
    address: 'Calle 1',
    tableCount: 3,
  });
  assert.equal(created.id, 1);
});

test('acepta los extremos del rango permitido', async () => {
  for (const tableCount of [1, 100]) {
    const { calls, repository } = repositoryDouble();
    await createPollingPlace(repository, { ...baseInput, tableCount });
    assert.equal(calls[0].tableCount, tableCount);
  }
});

test('rechaza cantidades vacías, cero, negativas, decimales, no seguras y mayores a 100', async () => {
  const invalidCounts = [
    undefined,
    null,
    0,
    -1,
    2.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
    101,
  ];

  for (const tableCount of invalidCounts) {
    const { calls, repository } = repositoryDouble();
    await assert.rejects(
      createPollingPlace(repository, { ...baseInput, tableCount }),
      /cantidad de mesas de 1 a 100/,
    );
    assert.equal(calls.length, 0);
  }
});

test('conserva la validación de parroquia y nombre', async () => {
  const { calls, repository } = repositoryDouble();

  await assert.rejects(
    createPollingPlace(repository, { ...baseInput, parishId: 0 }),
    /parroquia válida/,
  );
  await assert.rejects(
    createPollingPlace(repository, { ...baseInput, name: '   ' }),
    /nombre del recinto/,
  );
  assert.equal(calls.length, 0);
});
