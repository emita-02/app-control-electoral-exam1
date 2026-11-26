import assert from 'node:assert/strict';
import test from 'node:test';

import { createPersonnelMember } from './create-personnel-member.ts';

const baseInput = {
  role: 'veedor',
  fullName: '  Ana Veedor  ',
  idCard: '  1234567890  ',
  phone: '  0987654321  ',
  email: '  ANA@EJEMPLO.COM  ',
  electoralTableIds: [1, 2],
};

function repositoryDouble() {
  const calls = [];
  return {
    calls,
    repository: {
      async createMember(input) {
        calls.push(input);
      },
    },
  };
}

test('normaliza los datos y envía las mesas seleccionadas al repositorio', async () => {
  const { calls, repository } = repositoryDouble();
  await createPersonnelMember(repository, baseInput);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    ...baseInput,
    fullName: 'Ana Veedor',
    idCard: '1234567890',
    phone: '0987654321',
    email: 'ana@ejemplo.com',
    electoralTableIds: [1, 2],
  });
});

test('rechaza un veedor sin mesas seleccionadas', async () => {
  const { calls, repository } = repositoryDouble();
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, electoralTableIds: [] }),
    /Selecciona al menos una mesa/,
  );
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, electoralTableIds: undefined }),
    /Selecciona al menos una mesa/,
  );
  assert.equal(calls.length, 0);
});

test('rechaza mesas repetidas e identificadores no válidos', async () => {
  const { calls, repository } = repositoryDouble();
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, electoralTableIds: [1, 1] }),
    /misma mesa dos veces/,
  );
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, electoralTableIds: [1, 0] }),
    /mesas válidas/,
  );
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, electoralTableIds: [1, 2.5] }),
    /mesas válidas/,
  );
  assert.equal(calls.length, 0);
});

test('el coordinador de recinto no recibe mesas', async () => {
  const { calls, repository } = repositoryDouble();
  await createPersonnelMember(repository, {
    ...baseInput,
    role: 'coordinador_recinto',
    pollingPlaceId: 7,
    electoralTableIds: [],
  });
  assert.deepEqual(calls[0].electoralTableIds, []);

  await assert.rejects(
    createPersonnelMember(repository, {
      ...baseInput,
      role: 'coordinador_recinto',
      electoralTableIds: [],
    }),
    /Selecciona un recinto válido/,
  );
  await assert.rejects(
    createPersonnelMember(repository, {
      ...baseInput,
      role: 'coordinador_recinto',
      pollingPlaceId: 7,
      electoralTableIds: [1],
    }),
    /Solo los veedores/,
  );
  assert.equal(calls.length, 1);
});

test('conserva las validaciones de cédula, teléfono y correo', async () => {
  const { calls, repository } = repositoryDouble();
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, idCard: '   ' }),
    /cédula válida/,
  );
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, phone: '' }),
    /teléfono válido/,
  );
  await assert.rejects(
    createPersonnelMember(repository, { ...baseInput, email: 'no-correo' }),
    /correo electrónico válido/,
  );
  assert.equal(calls.length, 0);
});
