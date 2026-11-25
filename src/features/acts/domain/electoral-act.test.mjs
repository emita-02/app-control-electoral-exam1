import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareActCorrection } from '../application/prepare-act-correction.ts';
import {
  canCorrectElectoralAct,
  validateElectoralActForm,
} from './electoral-act.ts';

const observer = {
  id: 'observer-1',
  fullName: 'Veedor de prueba',
  roleId: 3,
  role: 'veedor',
  provinceId: 17,
  pollingPlaceId: 42,
};

const precinctCoordinator = {
  id: 'coordinator-1',
  fullName: 'Coordinador de prueba',
  roleId: 2,
  role: 'coordinador_recinto',
  provinceId: 17,
  pollingPlaceId: 42,
};

const act = {
  reference: 'act-reference-1',
  authorId: observer.id,
  pollingPlaceId: 42,
  electoralTableId: 8,
  currentValues: {
    candidateVotes: [
      { candidateReference: 'candidate-1', candidateName: 'Candidatura 1', votes: 40 },
      { candidateReference: 'candidate-2', candidateName: 'Candidatura 2', votes: 35 },
    ],
    blankVotes: 10,
    nullVotes: 5,
    totalVotes: 90,
    observations: 'Observación original',
  },
};

const validForm = {
  candidateVotes: [45, 35],
  blankVotes: 5,
  nullVotes: 5,
  totalVotes: 90,
  observations: 'Observación corregida',
};

test('requires every candidate and vote total field', () => {
  const result = validateElectoralActForm({
    candidateVotes: [null, 35],
    blankVotes: null,
    nullVotes: 5,
    totalVotes: null,
    observations: '',
  });

  assert.equal(result.isValid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.path),
    [['candidateVotes', 0], ['blankVotes'], ['totalVotes']],
  );
});

test('reuses arithmetic validation and requires an exact total match', () => {
  const inconsistent = validateElectoralActForm({
    ...validForm,
    totalVotes: 91,
  });
  const exact = validateElectoralActForm(validForm);

  assert.equal(inconsistent.isValid, false);
  assert.match(inconsistent.issues[0].message, /debe coincidir con el total/);
  assert.equal(exact.isValid, true);
});

test('rejects negative, fractional, and empty candidate vote values', () => {
  for (const candidateVotes of [[-1, 86], [1.5, 85.5], []]) {
    const result = validateElectoralActForm({
      ...validForm,
      candidateVotes,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.issues.length > 0);
  }
});

test('observer can correct acts only on currently assigned tables', () => {
  assert.equal(canCorrectElectoralAct(observer, act, [8]), true);
  assert.equal(canCorrectElectoralAct(observer, act, [9]), false);
  assert.equal(canCorrectElectoralAct(observer, { ...act, authorId: 'other-user' }, [8]), true);
  assert.equal(
    canCorrectElectoralAct(observer, { ...act, authorId: 'other-user' }, [9]),
    false,
  );
});

test('precinct coordinator can correct acts in their precinct, not other precincts', () => {
  assert.equal(canCorrectElectoralAct(precinctCoordinator, act, []), true);
  assert.equal(
    canCorrectElectoralAct(
      precinctCoordinator,
      { ...act, pollingPlaceId: 43 },
      [],
    ),
    false,
  );
  assert.equal(
    canCorrectElectoralAct(
      { ...precinctCoordinator, role: 'coordinador_provincial' },
      act,
      [],
    ),
    false,
  );
});

test('prepares an immutable correction proposal with a traceable reason and actor', () => {
  const original = structuredClone(act.currentValues);
  const result = prepareActCorrection({
    act,
    actor: observer,
    assignedTableIds: [8],
    values: validForm,
    reason: 'Se corrigió un valor transcrito.',
    now: new Date('2026-11-25T14:00:00.000Z'),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(act.currentValues, original);
  assert.deepEqual(result.proposal.previousValues, original);
  assert.equal(result.proposal.correctedValues.candidateVotes[0].votes, 45);
  assert.equal(result.proposal.correctedValues.observations, 'Observación corregida');
  assert.equal(result.proposal.correctedBy.userId, observer.id);
  assert.equal(result.proposal.correctedAt, '2026-11-25T14:00:00.000Z');
  assert.equal(result.proposal.reason, 'Se corrigió un valor transcrito.');
});

test('a replacement observer can prepare a correction while the original author is preserved', () => {
  const replacedAct = { ...act, authorId: 'previous-observer' };
  const result = prepareActCorrection({
    act: replacedAct,
    actor: observer,
    assignedTableIds: [8],
    values: validForm,
    reason: 'Reemplazo del veedor ausente',
    now: new Date('2026-11-25T15:00:00.000Z'),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.proposal.correctedBy.userId, observer.id);
    assert.equal(replacedAct.authorId, 'previous-observer');
  }
});

test('rejects a correction whose candidate list differs from the act', () => {
  const result = prepareActCorrection({
    act,
    actor: observer,
    assignedTableIds: [8],
    values: {
      ...validForm,
      candidateVotes: [80],
    },
    reason: 'Motivo',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /no coincide/);
  }
});

test('does not prepare unauthorized, unreasoned, or arithmetically invalid corrections', () => {
  const unauthorized = prepareActCorrection({
    act,
    actor: { ...observer, id: 'other-user' },
    assignedTableIds: [9],
    values: validForm,
    reason: 'Motivo',
  });
  const missingReason = prepareActCorrection({
    act,
    actor: observer,
    assignedTableIds: [8],
    values: validForm,
    reason: '  ',
  });
  const inconsistent = prepareActCorrection({
    act,
    actor: observer,
    assignedTableIds: [8],
    values: { ...validForm, totalVotes: 91 },
    reason: 'Motivo',
  });

  assert.equal(unauthorized.ok, false);
  assert.equal(missingReason.ok, false);
  assert.equal(inconsistent.ok, false);
});
