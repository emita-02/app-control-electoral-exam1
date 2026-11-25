import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_SYNC_ATTEMPTS,
  OfflineSyncWorker,
  retryDelayMs,
} from './sync-worker.ts';

function createQueue(initial = []) {
  let operations = initial.map((operation, index) => ({
    id: index + 1,
    type: operation.type,
    payload: operation.payload ?? {},
    localUri: operation.localUri ?? null,
    status: operation.status ?? 'pending',
    attempts: operation.attempts ?? 0,
    lastError: null,
    createdAt: '2026-11-25T00:00:00.000Z',
  }));
  let nextId = operations.length + 1;
  const state = new Map();

  return {
    enqueue(input) {
      const operation = {
        id: nextId++,
        type: input.type,
        payload: input.payload,
        localUri: input.localUri ?? null,
        status: 'pending',
        attempts: 0,
        lastError: null,
        createdAt: '2026-11-25T00:00:00.000Z',
      };
      operations.push(operation);
      return operation;
    },
    list() {
      return operations.map((operation) => ({
        ...operation,
        payload: { ...operation.payload },
      }));
    },
    update(id, patch) {
      operations = operations.map((operation) =>
        operation.id === id ? { ...operation, ...patch } : operation,
      );
    },
    remove(id) {
      operations = operations.filter((operation) => operation.id !== id);
    },
    getState(key) {
      return state.get(key) ?? null;
    },
    setState(key, value) {
      state.set(key, value);
    },
    deleteState(key) {
      state.delete(key);
    },
    listStates() {
      return [...state].map(([key, value]) => ({ key, value }));
    },
  };
}

function createDependencies(queue, overrides = {}) {
  const calls = { register: [], upload: [], ocr: [], confirm: [], exitPoll: [] };
  const reports = [];
  const dependencies = {
    queue,
    networkStatus: { isOnline: async () => true },
    electoralActRepository: {
      register: async (input) => {
        calls.register.push(input);
        return { id: 10, ...input };
      },
    },
    evidenceRepository: {
      upload: async (input) => {
        calls.upload.push(input);
        return { actId: input.actId, evidenceId: 11, storagePath: 'path' };
      },
    },
    confirmationRepository: {
      confirm: async (input) => {
        calls.confirm.push(input);
        return {
          actId: input.actId,
          status: 'aprobada',
          reviewedAt: '2026-11-25T01:00:00.000Z',
          correctionRegistered: false,
        };
      },
    },
    exitPollRepository: {
      register: async (input) => {
        calls.exitPoll.push(input);
        return { responseId: 1, createdAt: '2026-11-25T01:00:00.000Z' };
      },
    },
    actOcrRepository: {
      process: async (input) => {
        calls.ocr.push(input);
        return {
          actId: input.actId,
          evidenceId: input.evidenceId,
          results: [],
          warnings: [],
          requiresManualReview: true,
        };
      },
    },
    errorReporter: {
      report: async (error, context) => {
        reports.push({ error, context });
      },
      countPending: () => reports.length,
    },
    ...overrides,
  };
  return { dependencies, calls, reports };
}

const registerOperation = {
  type: 'register_act',
  payload: {
    __localId: -1,
    electoralTableId: 5,
    positionId: 2,
    candidateVotes: [],
    blankVotes: 0,
    nullVotes: 0,
    totalVotes: 0,
    observation: null,
  },
};

const uploadOperation = {
  type: 'upload_evidence',
  payload: {
    __localEvidenceId: -2,
    localActId: -1,
    localUri: 'file:///evidence.jpg',
    capturedAt: '2026-11-25T00:00:00.000Z',
    latitude: 0,
    longitude: 0,
  },
};

const confirmOperation = {
  type: 'confirm_ocr',
  payload: {
    action: 'confirm_ocr',
    actId: -1,
    evidenceId: -2,
    candidateVotes: [],
    blankVotes: 0,
    nullVotes: 0,
    totalVotes: 0,
    observation: null,
    reason: 'Revisión manual',
  },
};

test('sincroniza en dos fases y resuelve el OCR generado en la misma pasada', async () => {
  const queue = createQueue([registerOperation, uploadOperation, confirmOperation]);
  const { dependencies, calls } = createDependencies(queue);

  const result = await new OfflineSyncWorker(dependencies).sync();

  assert.equal(result.online, true);
  assert.equal(result.processed, 4);
  assert.equal(result.failed, 0);
  assert.deepEqual(queue.list(), []);
  assert.equal(calls.register.length, 1);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.upload[0].actId, 10);
  assert.equal(calls.ocr.length, 1);
  assert.deepEqual(calls.ocr[0], { actId: 10, evidenceId: 11 });
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.confirm[0].actId, 10);
  assert.equal(queue.getState('ocr_review.-2'), '{"actId":10,"evidenceId":11}');
});

test('no reenvía una operación ya sincronizada aunque quede una copia pendiente', async () => {
  const queue = createQueue([registerOperation]);
  const { dependencies, calls } = createDependencies(queue);
  const worker = new OfflineSyncWorker(dependencies);

  await worker.sync();
  queue.enqueue({ type: 'register_act', payload: registerOperation.payload });
  const retry = queue.list()[0];
  queue.update(retry.id, { attempts: 1, status: 'failed' });

  const result = await worker.sync();

  assert.equal(calls.register.length, 1);
  assert.equal(result.processed, 1);
  assert.deepEqual(queue.list(), []);
});

test('aplica retroceso y reintenta sin perder la operación', async () => {
  const uploadWithRemoteAct = {
    ...uploadOperation,
    payload: { ...uploadOperation.payload, localActId: 10 },
  };
  const queue = createQueue([uploadWithRemoteAct]);
  let attempts = 0;
  const { dependencies, calls } = createDependencies(queue, {
    evidenceRepository: {
      upload: async (input) => {
        calls.upload.push(input);
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Servidor no disponible');
        }
        return { actId: 10, evidenceId: 11, storagePath: 'path' };
      },
    },
  });
  const worker = new OfflineSyncWorker(dependencies);

  const first = await worker.sync();
  assert.equal(first.failed, 1);
  assert.equal(queue.list().length, 1);
  assert.equal(queue.list()[0].attempts, 1);
  assert.ok(queue.getState('retry_after.1'));

  const second = await worker.sync();
  assert.equal(
    second.failed,
    0,
    'el reintento no debe hacerse antes de vencer el retroceso',
  );
  assert.equal(calls.upload.length, 1);

  // Se simula el paso del tiempo permitiendo el reintento.
  queue.setState('retry_after.1', new Date(Date.now() - 1_000).toISOString());
  const third = await worker.sync();
  assert.equal(third.processed, 2, 'la carga y el OCR se resuelven en la misma fase');
  assert.equal(calls.upload.length, 2);
  assert.equal(queue.getState('retry_after.1'), null);
});

test('no sincroniza una operación creada por otra cuenta', async () => {
  const queue = createQueue([
    { ...registerOperation, payload: { ...registerOperation.payload, __ownerId: 'user-a' } },
  ]);
  const { dependencies, calls, reports } = createDependencies(queue, {
    getCurrentUserId: () => 'user-b',
  });

  const result = await new OfflineSyncWorker(dependencies).sync();

  assert.equal(calls.register.length, 0);
  assert.equal(result.failed, 1);
  assert.equal(queue.list()[0].attempts, MAX_SYNC_ATTEMPTS);
  assert.match(queue.list()[0].lastError, /otra cuenta/);
  assert.equal(reports[0].context.details.reason, 'owner_mismatch');
});

test('deja de reintentar automáticamente después del máximo de intentos', async () => {
  const queue = createQueue([{ ...registerOperation, attempts: MAX_SYNC_ATTEMPTS }]);
  const { dependencies, calls } = createDependencies(queue);

  const result = await new OfflineSyncWorker(dependencies).sync();

  assert.equal(result.processed, 0);
  assert.equal(calls.register.length, 0);
  assert.equal(queue.list().length, 1);
});

test('el retroceso crece de forma acotada', () => {
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 120_000);
  assert.equal(retryDelayMs(3), 240_000);
  assert.equal(retryDelayMs(6), 960_000);
});
