import assert from 'node:assert/strict';
import test from 'node:test';

import { proposalToConfirmationInput } from './confirm-correction.ts';

const proposal = {
  actReference: 'act-1',
  previousValues: {
    candidateVotes: [
      { candidateReference: '1', candidateName: 'A', votes: 5 },
      { candidateReference: '2', candidateName: 'B', votes: 3 },
    ],
    blankVotes: 1,
    nullVotes: 1,
    totalVotes: 10,
    observations: 'Anterior',
  },
  correctedValues: {
    candidateVotes: [
      { candidateReference: '1', candidateName: 'A', votes: 6 },
      { candidateReference: '2', candidateName: 'B', votes: 2 },
    ],
    blankVotes: 1,
    nullVotes: 1,
    totalVotes: 10,
    observations: 'Revisado',
  },
  correctedBy: {
    userId: 'user-1',
    fullName: 'Veedor',
    role: 'veedor',
  },
  correctedAt: '2026-11-25T00:00:00.000Z',
  reason: 'Error de transcripción',
};

test('la propuesta revisada se convierte en una orden apply_correction', () => {
  const input = proposalToConfirmationInput(proposal, 42);

  assert.equal(input.action, 'apply_correction');
  assert.equal(input.actId, 42);
  assert.deepEqual(input.candidateVotes, [
    { candidateId: 1, votes: 6 },
    { candidateId: 2, votes: 2 },
  ]);
  assert.equal(input.blankVotes, 1);
  assert.equal(input.nullVotes, 1);
  assert.equal(input.totalVotes, 10);
  assert.equal(input.observation, 'Revisado');
  assert.equal(input.reason, 'Error de transcripción');
});

test('una observación vacía se envía como nula', () => {
  const input = proposalToConfirmationInput(
    {
      ...proposal,
      correctedValues: { ...proposal.correctedValues, observations: '   ' },
    },
    7,
  );

  assert.equal(input.observation, null);
});
