import type {
  Canton,
  CreatePollingPlaceInput,
  ElectoralTable,
  Parish,
  PollingPlace,
  ProvinceTerritory,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

const territorySelection = `
  id,
  name,
  cantons (
    id,
    code,
    name,
    parishes (
      id,
      code,
      name,
      parish_type,
      polling_places (
        id,
        code,
        name,
        address,
        electoral_tables (
          id,
          table_number
        )
      )
    )
  )
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('La estructura territorial recibida no tiene el formato esperado.');
  }
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('La estructura territorial recibida no tiene el formato esperado.');
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error('La estructura territorial recibida no tiene el formato esperado.');
  }
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('La estructura territorial recibida no tiene el formato esperado.');
  }
  return value;
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('La estructura territorial recibida no tiene el formato esperado.');
  }
  return value;
}

function readCreatedPollingPlace(value: unknown): PollingPlace {
  const response = readRecord(value);
  const record = readRecord(response.pollingPlace);
  return {
    id: readInteger(record.id),
    code: readNullableString(record.code),
    name: readString(record.name),
    address: readNullableString(record.address),
    electoralTables: [],
  };
}

async function getFunctionErrorMessage(error: { context: unknown }): Promise<string> {
  if (error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (isRecord(body) && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      return 'No se pudo registrar el recinto. Verifica tu conexión e inténtalo nuevamente.';
    }
  }

  return 'No se pudo registrar el recinto. Verifica tu conexión y tus permisos.';
}

function mapElectoralTable(value: unknown): ElectoralTable {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    tableNumber: readInteger(record.table_number),
  };
}

function mapPollingPlace(value: unknown): PollingPlace {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    code: readNullableString(record.code),
    name: readString(record.name),
    address: readNullableString(record.address),
    electoralTables: readArray(record.electoral_tables).map(mapElectoralTable),
  };
}

function mapParish(value: unknown): Parish {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    code: readNullableString(record.code),
    name: readString(record.name),
    type: readString(record.parish_type),
    pollingPlaces: readArray(record.polling_places).map(mapPollingPlace),
  };
}

function mapCanton(value: unknown): Canton {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    code: readNullableString(record.code),
    name: readString(record.name),
    parishes: readArray(record.parishes).map(mapParish),
  };
}

function mapProvince(value: unknown): ProvinceTerritory {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    name: readString(record.name),
    cantons: readArray(record.cantons).map(mapCanton),
  };
}

export class SupabaseTerritoryRepository implements ProvinceTerritoryRepository {
  async findByProvinceId(provinceId: number): Promise<ProvinceTerritory> {
    const { data, error } = await supabase
      .from('provinces')
      .select(territorySelection)
      .eq('id', provinceId)
      .maybeSingle();

    if (error) {
      throw new Error(
        'No se pudo consultar la estructura territorial. Verifica tu conexión y permisos.',
      );
    }

    if (!data) {
      throw new Error('No se encontró la provincia asignada a tu perfil.');
    }

    return mapProvince(data);
  }

  async createPollingPlace(input: CreatePollingPlaceInput): Promise<PollingPlace> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { data, error } = await supabase.functions.invoke<unknown>(
      'registrar-recinto',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          parishId: input.parishId,
          name: input.name,
          code: input.code,
          address: input.address,
        },
      },
    );

    if (error) {
      throw new Error(await getFunctionErrorMessage(error));
    }

    return readCreatedPollingPlace(data);
  }
}
