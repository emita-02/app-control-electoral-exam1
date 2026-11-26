import { userRoles } from '@/features/auth/domain/user-profile';
import type {
  CreatePersonnelInput,
  PersonnelMember,
  PersonnelOverview,
  PersonnelRepository,
  SaveWatcherAssignmentsInput,
  WatcherAssignment,
} from '@/features/personnel/domain/personnel';
import type {
  Canton,
  ElectoralTable,
  PollingPlace,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';
import { supabase } from '@/features/auth/infrastructure/supabase-client';
import type { ErrorReporter } from '@/features/monitoring/domain/error-reporter';

type PostgrestErrorLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function readErrorField(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '—';
  }
  return value.trim().slice(0, 300).replace(/[\r\n]+/g, ' ');
}

/** Conserva los cuatro campos originales de PostgREST en lugar de ocultarlos. */
function describePostgrestError(
  label: string,
  error: PostgrestErrorLike,
): string {
  return `${label} [message=${readErrorField(error.message)}; code=${readErrorField(error.code)}; details=${readErrorField(error.details)}; hint=${readErrorField(error.hint)}]`;
}

const roleIds = {
  coordinador_recinto: 2,
  veedor: 3,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResponseLike(
  value: unknown,
): value is Pick<Response, 'clone' | 'status' | 'text'> {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.clone === 'function'
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readNullableInteger(value: unknown): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function mapMember(value: unknown): PersonnelMember {
  const record = readRecord(value);
  const roleId = readInteger(record.role_id);
  const role =
    roleId === roleIds.coordinador_recinto
      ? userRoles.precinctCoordinator
      : roleId === roleIds.veedor
        ? userRoles.observer
        : null;

  if (!role || typeof record.is_active !== 'boolean') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }

  return {
    id: readString(record.id),
    fullName: readString(record.full_name),
    idCard: readNullableString(record.id_card) ?? '',
    phone: readNullableString(record.phone) ?? '',
    role,
    provinceId: readNullableInteger(record.province_id),
    pollingPlaceId: readNullableInteger(record.polling_place_id),
    isActive: record.is_active,
  };
}

function mapElectoralTable(value: unknown): ElectoralTable {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    tableNumber: readInteger(record.table_number),
  };
}

function mapAssignment(value: unknown): WatcherAssignment {
  const record = readRecord(value);
  const relation = Array.isArray(record.electoral_tables)
    ? record.electoral_tables[0]
    : record.electoral_tables;
  const table = readRecord(relation);

  return {
    id: readInteger(record.id),
    watcherId: readString(record.watcher_id),
    electoralTableId: readInteger(record.electoral_table_id),
    tableNumber: readInteger(table.table_number),
    assignedAt: readString(record.assigned_at),
    endedAt: readNullableString(record.ended_at),
    endedBy: readNullableString(record.ended_by),
    endReason: readNullableString(record.end_reason),
  };
}

function flattenPollingPlaces(cantons: Canton[]): PollingPlace[] {
  return cantons.flatMap((canton) =>
    canton.parishes.flatMap((parish) => parish.pollingPlaces),
  );
}

export class SupabasePersonnelRepository implements PersonnelRepository {
  constructor(
    private readonly territoryRepository: ProvinceTerritoryRepository,
    private readonly errorReporter?: ErrorReporter,
  ) {}

  private reportPostgrestError(
    operation: string,
    error: PostgrestErrorLike,
  ): void {
    void this.errorReporter?.report(error, {
      screen: 'Gestión de personal',
      operation,
      details: {
        postgrest_message:
          typeof error.message === 'string' ? error.message.slice(0, 300) : '',
        postgrest_code: typeof error.code === 'string' ? error.code : '',
        postgrest_details:
          typeof error.details === 'string' ? error.details.slice(0, 300) : '',
        postgrest_hint:
          typeof error.hint === 'string' ? error.hint.slice(0, 300) : '',
      },
    });
  }

  async load(profile: Parameters<PersonnelRepository['load']>[0]): Promise<PersonnelOverview> {
    const emptyOverview: PersonnelOverview = {
      members: [],
      assignments: [],
      electoralTables: [],
      pollingPlaces: [],
    };

    if (profile.role === userRoles.provincialCoordinator) {
      if (profile.provinceId === null) {
        throw new Error('Tu perfil no tiene una provincia asignada.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, id_card, phone, role_id, province_id, polling_place_id, is_active')
        .eq('role_id', roleIds.coordinador_recinto)
        .eq('province_id', profile.provinceId)
        .order('full_name');

      if (error) {
        this.reportPostgrestError('load_coordinadores_recinto', error);
        throw new Error(
          describePostgrestError(
            'No se pudieron consultar los coordinadores de recinto.',
            error,
          ),
        );
      }

      const province = await this.territoryRepository.findByProvinceId(profile.provinceId);
      return {
        ...emptyOverview,
        members: (data ?? []).map(mapMember),
        pollingPlaces: flattenPollingPlaces(province.cantons),
      };
    }

    if (profile.role !== userRoles.precinctCoordinator || profile.pollingPlaceId === null) {
      throw new Error('Tu cuenta no tiene acceso a la gestión de personal.');
    }

    const [membersResult, tablesResult, assignmentsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, id_card, phone, role_id, province_id, polling_place_id, is_active')
        .eq('role_id', roleIds.veedor)
        .eq('polling_place_id', profile.pollingPlaceId)
        .order('full_name'),
      supabase
        .from('electoral_tables')
        .select('id, table_number')
        .eq('polling_place_id', profile.pollingPlaceId)
        .order('table_number'),
      supabase
        .from('watcher_assignments')
        .select(
          'id, watcher_id, electoral_table_id, assigned_at, ended_at, ended_by, end_reason, electoral_tables!inner(id, table_number, polling_place_id)',
        )
        .eq('electoral_tables.polling_place_id', profile.pollingPlaceId)
        .order('assigned_at', { ascending: false }),
    ]);

    type QueryFailure = {
      operation: string;
      label: string;
      error: PostgrestErrorLike;
    };
    const failures: QueryFailure[] = [];
    if (membersResult.error) {
      failures.push({
        operation: 'load_veedores_recinto',
        label: 'el personal del recinto',
        error: membersResult.error,
      });
    }
    if (tablesResult.error) {
      failures.push({
        operation: 'load_mesas_recinto',
        label: 'las mesas del recinto',
        error: tablesResult.error,
      });
    }
    if (assignmentsResult.error) {
      failures.push({
        operation: 'load_asignaciones_recinto',
        label: 'las asignaciones del recinto',
        error: assignmentsResult.error,
      });
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        this.reportPostgrestError(failure.operation, failure.error);
      }
      const detail = failures
        .map((failure) =>
          describePostgrestError(
            `No se pudo consultar ${failure.label}.`,
            failure.error,
          ),
        )
        .join(' | ');
      throw new Error(
        `No se pudo consultar el personal y las asignaciones del recinto. ${detail}`,
      );
    }

    return {
      ...emptyOverview,
      members: (membersResult.data ?? []).map(mapMember),
      electoralTables: (tablesResult.data ?? []).map(mapElectoralTable),
      assignments: (assignmentsResult.data ?? []).map(mapAssignment),
    };
  }

  async createMember(input: CreatePersonnelInput): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { error } = await supabase.functions.invoke<unknown>('gestionar-personal', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action: 'create_member',
        role: input.role,
        roleId: roleIds[input.role],
        fullName: input.fullName,
        idCard: input.idCard,
        phone: input.phone,
        email: input.email,
        pollingPlaceId: input.pollingPlaceId ?? null,
        electoralTableIds: input.electoralTableIds ?? [],
      },
    });

    if (error) {
      throw new Error(await this.getCreateMemberErrorMessage(error));
    }
  }

  async saveAssignments(input: SaveWatcherAssignmentsInput): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { error } = await supabase.functions.invoke<unknown>('gestionar-personal', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action: 'save_assignments',
        watcherRoleId: roleIds.veedor,
        watcherId: input.watcherId,
        electoralTableIds: input.electoralTableIds,
        replacingWatcherId: input.replacingWatcherId ?? null,
        endReason: input.endReason ?? null,
      },
    });

    if (error) {
      throw new Error(await this.getFunctionErrorMessage(error));
    }
  }

  private async readFunctionError(
    error: { name?: string; message?: string; context?: unknown },
    fallback: string,
  ): Promise<string> {
    const context = error.context;
    if (isResponseLike(context)) {
      const details: string[] = [];
      try {
        const body: unknown = await context.clone().json();
        if (isRecord(body)) {
          for (const key of ['error', 'message', 'detail', 'code'] as const) {
            const value = body[key];
            if (typeof value === 'string' && value.trim()) {
              details.push(value.trim().slice(0, 300));
            }
          }
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            details.push(text.trim().slice(0, 300));
          }
        } catch {
          // Se conserva el HTTP status aunque el cuerpo no se pueda leer.
        }
      }

      const suffix = details.length > 0 ? `: ${details.join(' | ')}` : '';
      return `${fallback} (HTTP ${context.status}${suffix}).`;
    }

    const name = typeof error.name === 'string' ? error.name : 'Error';
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    const suffix = message ? `: ${message.slice(0, 300)}` : '';
    return `${fallback} (${name}${suffix}).`;
  }

  private async getFunctionErrorMessage(error: {
    name?: string;
    message?: string;
    context?: unknown;
  }): Promise<string> {
    return this.readFunctionError(
      error,
      'No se pudo completar la operación. Verifica tu conexión y permisos.',
    );
  }

  private async getCreateMemberErrorMessage(error: {
    name?: string;
    message?: string;
    context?: unknown;
  }): Promise<string> {
    return this.readFunctionError(
      error,
      'No se pudo crear la cuenta. Revisa el detalle del servidor.',
    );
  }
}
