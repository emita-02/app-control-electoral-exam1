import assert from 'node:assert/strict';
import test from 'node:test';

import { registerElectoralAct } from './electoral-act-registration.ts';

function makeRepository(registerImpl = async () => registeredAct) {
  const calls = [];
  return {
    calls,
    async loadCatalog() {
      return { tables: [], positions: [], candidates: [] };
    },
    async register(input) {
      calls.push(input);
      return registerImpl(input);
    },
  };
}

const registeredAct = {
  id: 10,
  electoralTableId: 8,
  positionId: 1,
  status: 'pendiente_revision',
  totalVotes: 90,
  blankVotes: 10,
  nullVotes: 5,
  observation: null,
  registeredBy: 'veedor-1',
  createdAt: '2026-11-25T12:00:00.000Z',
};

const validInput = {
  electoralTableId: 8,
  positionId: 1,
  candidateVotes: [
    { candidateId: 1, votes: 40 },
    { candidateId: 2, votes: 35 },
  ],
  blankVotes: 10,
  nullVotes: 5,
  totalVotes: 90,
  observation: 'Acta revisada',
};

test('registra un acta válida y devuelve la confirmación del repositorio', async () => {
  const repository = makeRepository();

  const result = await registerElectoralAct(repository, validInput);

  assert.equal(result.ok, true);
  assert.deepEqual(result.act, registeredAct);
  assert.equal(repository.calls.length, 1);
  assert.deepEqual(repository.calls[0], validInput);
});

test('rechaza una suma que no coincide con el total sin escribir', async () => {
  const repository = makeRepository();

  const result = await registerElectoralAct(repository, {
    ...validInput,
    totalVotes: 89,
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /suma/i);
  assert.equal(repository.calls.length, 0);
});

test('rechaza candidaturas repetidas sin escribir', async () => {
  const repository = makeRepository();

  const result = await registerElectoralAct(repository, {
    ...validInput,
    candidateVotes: [
      { candidateId: 1, votes: 40 },
      { candidateId: 1, votes: 35 },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /repetida/i);
  assert.equal(repository.calls.length, 0);
});

test('muestra el mensaje del repositorio cuando el servidor rechaza el acta', async () => {
  const repository = makeRepository(async () => {
    throw new Error('Ya existe un acta registrada para esta mesa y dignidad.');
  });

  const result = await registerElectoralAct(repository, validInput);

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Ya existe un acta registrada para esta mesa y dignidad.',
  );
  assert.equal(repository.calls.length, 1);
});
