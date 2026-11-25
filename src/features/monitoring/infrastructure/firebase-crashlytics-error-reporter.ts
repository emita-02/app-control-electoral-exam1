import {
  checkForUnsentReports,
  getCrashlytics,
  log,
  recordError,
  sendUnsentReports,
  setAttributes,
  type Crashlytics,
} from '@react-native-firebase/crashlytics';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type {
  ErrorReportContext,
  ErrorReporter,
} from '@/features/monitoring/domain/error-reporter';
import { SQLiteErrorReporter } from '@/features/monitoring/infrastructure/sqlite-error-reporter';

const ATTRIBUTE_LIMIT = 100;
const DETAIL_LIMIT = 8;
const SENSITIVE_KEY = /(token|secret|password|clave|authorization|apikey|api_key|email|correo)/i;

function truncate(value: string): string {
  return value.slice(0, ATTRIBUTE_LIMIT);
}

function toError(error: unknown): Error {
  if (error instanceof Error && error.message) {
    return error;
  }
  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }
  return new Error('Error inesperado sin mensaje.');
}

function buildAttributes(context: ErrorReportContext): Record<string, string> {
  const attributes: Record<string, string> = {
    screen: truncate(context.screen ?? 'Aplicación'),
    operation: truncate(context.operation ?? 'error'),
  };

  let included = 0;
  for (const [key, value] of Object.entries(context.details ?? {})) {
    if (included >= DETAIL_LIMIT || SENSITIVE_KEY.test(key)) {
      continue;
    }
    attributes[`detail_${truncate(key)}`] = truncate(String(value ?? 'null'));
    included += 1;
  }

  return attributes;
}

function initialize(crashlytics: Crashlytics): void {
  try {
    void setAttributes(crashlytics, {
      app: 'control-electoral',
      platform: Platform.OS,
      android_version: truncate(Device.osVersion ?? 'desconocida'),
      device_model: truncate(Device.modelName ?? 'desconocido'),
    }).catch(() => undefined);
  } catch {
    // Crashlytics puede estar desactivado en compilaciones de depuración.
  }
}

const crashlytics: Crashlytics | null = (() => {
  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    const instance = getCrashlytics();
    initialize(instance);
    return instance;
  } catch {
    // Sin el módulo nativo (por ejemplo, Expo Go) se conserva solo el reporte local.
    return null;
  }
})();

export class FirebaseCrashlyticsErrorReporter implements ErrorReporter {
  constructor(private readonly localReporter: ErrorReporter = new SQLiteErrorReporter()) {}

  async report(error: unknown, context: ErrorReportContext = {}): Promise<void> {
    await this.localReporter.report(error, context);

    if (!crashlytics) {
      return;
    }

    try {
      await setAttributes(crashlytics, buildAttributes(context));
    } catch {
      // El reporte local ya quedó guardado aunque Crashlytics no acepte atributos.
    }

    try {
      log(crashlytics, `Reporte de error: ${context.operation ?? 'error'}`);
      recordError(
        crashlytics,
        toError(error),
        truncate(context.operation ?? 'AppError'),
      );
    } catch {
      // No se interrumpe la aplicación si el envío a Crashlytics falla.
    }
  }

  countPending(): number {
    return this.localReporter.countPending();
  }

  async flush(): Promise<number> {
    if (!crashlytics) {
      return 0;
    }

    try {
      if (await checkForUnsentReports(crashlytics)) {
        sendUnsentReports(crashlytics);
      }
    } catch {
      // Crashlytics puede no estar disponible en compilaciones de depuración.
      return 0;
    }

    if (this.localReporter instanceof SQLiteErrorReporter) {
      return this.localReporter.markAllSent();
    }
    return 0;
  }
}
