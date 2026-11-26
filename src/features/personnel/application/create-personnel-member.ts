import type {
  CreatePersonnelInput,
  PersonnelRepository,
} from '@/features/personnel/domain/personnel';

const emailPattern =
  /^(?=.{1,254}$)[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

export async function createPersonnelMember(
  repository: PersonnelRepository,
  input: CreatePersonnelInput,
): Promise<void> {
  const fullName = input.fullName.trim();
  const idCard = input.idCard.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) {
    throw new Error('Ingresa los nombres y apellidos.');
  }
  if (!idCard || idCard.length > 32) {
    throw new Error('Ingresa una cédula válida.');
  }
  if (!phone || phone.length > 32) {
    throw new Error('Ingresa un teléfono válido.');
  }
  if (!emailPattern.test(email)) {
    throw new Error('Ingresa un correo electrónico válido.');
  }
  if (
    input.role === 'coordinador_recinto' &&
    (!Number.isSafeInteger(input.pollingPlaceId) || (input.pollingPlaceId ?? 0) <= 0)
  ) {
    throw new Error('Selecciona un recinto válido.');
  }

  let electoralTableIds: number[] = [];
  if (input.role === 'veedor') {
    const requested = input.electoralTableIds;
    if (!Array.isArray(requested) || requested.length === 0) {
      throw new Error('Selecciona al menos una mesa para el veedor.');
    }
    if (requested.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('Selecciona mesas válidas para el veedor.');
    }
    if (new Set(requested).size !== requested.length) {
      throw new Error('No selecciones la misma mesa dos veces.');
    }
    electoralTableIds = [...requested];
  } else if (input.electoralTableIds && input.electoralTableIds.length > 0) {
    throw new Error('Solo los veedores pueden tener mesas asignadas.');
  }

  await repository.createMember({
    ...input,
    fullName,
    idCard,
    phone,
    email,
    electoralTableIds,
  });
}
