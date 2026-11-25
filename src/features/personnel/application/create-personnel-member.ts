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
  const email = input.email.trim().toLowerCase();

  if (!fullName) {
    throw new Error('Ingresa los nombres y apellidos.');
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

  await repository.createMember({
    ...input,
    fullName,
    email,
  });
}
