import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState, useCallback  } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';
import { useFocusEffect } from '@react-navigation/native';


import { userRoles } from '@/features/auth/domain/user-profile';
import {
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import type { PersonnelMember } from '@/features/personnel/domain/personnel';
import {
  clearPersonnelAction,
  createMember,
  loadPersonnel,
  updateAssignments,
} from '@/features/personnel/presentation/personnel-slice';
import { useAppDispatch, useAppSelector } from '@/store/store';

const memberSchema = z
  .object({
    role: z.enum([userRoles.precinctCoordinator, userRoles.observer]),
    fullName: z.string().trim().min(1, 'Ingresa los nombres y apellidos.').max(160, 'Los nombres y apellidos son demasiado largos.'),
    idCard: z.string().trim().regex(/^\d{10}$/, 'La cédula debe tener 10 dígitos numéricos.'),
    phone: z.string().trim().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos numéricos.'),
    email: z
      .string()
      .trim()
      .email('Ingresa un correo electrónico válido.')
      .max(254, 'El correo electrónico es demasiado largo.')
      .regex(/@gmail\.com$/i, 'El correo debe terminar en @gmail.com.'),
    pollingPlaceId: z.number().int().positive().nullable(),
    electoralTableIds: z.array(z.number().int().positive()),
  })
  .superRefine((values, context) => {
    if (values.role === userRoles.precinctCoordinator) {
      if (values.pollingPlaceId === null) {
        context.addIssue({
          code: 'custom',
          path: ['pollingPlaceId'],
          message: 'Selecciona un recinto.',
        });
      }
      if (values.electoralTableIds.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['electoralTableIds'],
          message: 'Solo los veedores pueden tener mesas asignadas.',
        });
      }
    } else if (values.electoralTableIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['electoralTableIds'],
        message: 'Selecciona al menos una mesa para el veedor.',
      });
    }
    if (new Set(values.electoralTableIds).size !== values.electoralTableIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['electoralTableIds'],
        message: 'No selecciones la misma mesa dos veces.',
      });
    }
  });

const assignmentSchema = z
  .object({
    watcherId: z.string().min(1, 'Selecciona el nuevo veedor.'),
    replacingWatcherId: z.string(),
    electoralTableIds: z
      .array(z.number().int().positive())
      .min(1, 'Selecciona una o más mesas.'),
    endReason: z.string(),
  })
  .superRefine((values, context) => {
    if (values.replacingWatcherId && values.replacingWatcherId === values.watcherId) {
      context.addIssue({
        code: 'custom',
        path: ['watcherId'],
        message: 'El veedor nuevo debe ser diferente al veedor reemplazado.',
      });
    }
    if (values.replacingWatcherId && !values.endReason.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['endReason'],
        message: 'Indica el motivo del reemplazo.',
      });
    }
  });

type MemberFormValues = z.infer<typeof memberSchema>;
type AssignmentFormValues = z.infer<typeof assignmentSchema>;

function OptionRow({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      className={`min-h-12 justify-center rounded-xl border px-4 py-3 ${
        selected
          ? 'border-electoral-cyan bg-electoral-cyan-light'
          : 'border-electoral-border bg-white'
      } ${disabled ? 'opacity-50' : ''}`}
      disabled={disabled}
      onPress={onPress}>
      <Text className="text-sm font-medium text-electoral-navy">{label}</Text>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="text-lg font-bold text-electoral-navy">{children}</Text>;
}

function MemberRow({
  member,
  locationName,
}: {
  member: PersonnelMember;
  locationName?: string;
}) {
  return (
    <View className="gap-1 rounded-xl border border-electoral-border bg-white p-4">
      <Text className="text-base font-semibold text-electoral-navy">{member.fullName}</Text>
      <Text className="text-sm text-electoral-muted">
        Cédula {member.idCard || 'sin registrar'} · Teléfono {member.phone || 'sin registrar'}
      </Text>
      <Text className="text-sm text-electoral-muted">
        {member.isActive ? 'Cuenta activa' : 'Cuenta inactiva'}
        {locationName ? ` · ${locationName}` : ''}
      </Text>
    </View>
  );
}

export function PersonnelManagementScreen() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.auth.profile);
  const { overview, loadStatus, loadError, actionStatus, actionError } =
    useAppSelector((state) => state.personnel);
  const [success, setSuccess] = useState<string | null>(null);
  const isProvincial = profile?.role === userRoles.provincialCoordinator;
  const isPrecinct = profile?.role === userRoles.precinctCoordinator;

  const memberForm = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      role: userRoles.observer,
      fullName: '',
      idCard: '',
      phone: '',
      email: '',
      pollingPlaceId: null,
      electoralTableIds: [],
    },
  });
  const assignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      watcherId: '',
      replacingWatcherId: '',
      electoralTableIds: [],
      endReason: '',
    },
  });
  const selectedPollingPlaceId = useWatch({
    control: memberForm.control,
    name: 'pollingPlaceId',
  });
  const selectedMemberTableIds = useWatch({
    control: memberForm.control,
    name: 'electoralTableIds',
  });
  const selectedWatcherId = useWatch({
    control: assignmentForm.control,
    name: 'watcherId',
  });
  const selectedReplacingWatcherId = useWatch({
    control: assignmentForm.control,
    name: 'replacingWatcherId',
  });
  const selectedTableIds = useWatch({
    control: assignmentForm.control,
    name: 'electoralTableIds',
  });

  const setMemberValue = memberForm.setValue;
  useEffect(() => {
    if (profile && (isProvincial || isPrecinct)) {
      setMemberValue(
        'role',
        isProvincial ? userRoles.precinctCoordinator : userRoles.observer,
      );
      void dispatch(loadPersonnel(profile));
    }
  }, [dispatch, isPrecinct, isProvincial, profile, setMemberValue]);

  useFocusEffect(
    useCallback(() => {
      dispatch(clearPersonnelAction());
      setSuccess(null);
    }, [dispatch]),
  );

  const placeNames = useMemo(
    () => new Map((overview?.pollingPlaces ?? []).map((place) => [place.id, place.name])),
    [overview?.pollingPlaces],
  );
  const activeWatchers = (overview?.members ?? []).filter(
    (member) => member.role === userRoles.observer && member.isActive,
  );
  const allWatchers = (overview?.members ?? []).filter(
    (member) => member.role === userRoles.observer,
  );
  const assignedTableLabels = useMemo(() => {
    const labels = new Map<number, string>();
    for (const assignment of overview?.assignments ?? []) {
      if (assignment.endedAt !== null) continue;
      const watcher = (overview?.members ?? []).find(
        (member) => member.id === assignment.watcherId,
      );
      labels.set(assignment.electoralTableId, watcher?.fullName ?? 'otro veedor');
    }
    return labels;
  }, [overview?.assignments, overview?.members]);
  const replacingWatcherId = selectedReplacingWatcherId;

  if (!profile || (!isProvincial && !isPrecinct)) {
    return <LoadingScreen message="Validando permisos de personal…" />;
  }

  const reload = async () => {
    await dispatch(loadPersonnel(profile)).unwrap();
  };

  const submitMember = async (values: MemberFormValues) => {
    setSuccess(null);
    dispatch(clearPersonnelAction());
    try {
      await dispatch(
        createMember({
          role: isProvincial ? userRoles.precinctCoordinator : userRoles.observer,
          fullName: values.fullName,
          idCard: values.idCard,
          phone: values.phone,
          email: values.email,
          ...(isProvincial ? { pollingPlaceId: values.pollingPlaceId ?? undefined } : {}),
          ...(isPrecinct ? { electoralTableIds: values.electoralTableIds } : {}),
        }),
      ).unwrap();
      await reload();
      memberForm.reset({
        role: isProvincial ? userRoles.precinctCoordinator : userRoles.observer,
        fullName: '',
        idCard: '',
        phone: '',
        email: '',
        pollingPlaceId: null,
        electoralTableIds: [],
      });
      setSuccess(
        isPrecinct
          ? 'Se envió la invitación y se asignaron las mesas seleccionadas.'
          : 'Se envió la invitación al correo indicado.',
      );
    } catch {
      setSuccess(null);
    }
  };

  const submitAssignments = async (values: AssignmentFormValues) => {
    setSuccess(null);
    dispatch(clearPersonnelAction());
    try {
      await dispatch(
        updateAssignments({
          watcherId: values.watcherId,
          electoralTableIds: values.electoralTableIds,
          ...(values.replacingWatcherId
            ? {
                replacingWatcherId: values.replacingWatcherId,
                endReason: values.endReason,
              }
            : {}),
        }),
      ).unwrap();
      await reload();
      assignmentForm.reset({
        watcherId: '',
        replacingWatcherId: '',
        electoralTableIds: [],
        endReason: '',
      });
      setSuccess('Las asignaciones se actualizaron correctamente.');
    } catch {
      setSuccess(null);
    }
  };

  return (
    <AuthShell>
      <AuthHeading
        title={isProvincial ? 'Coordinadores de recinto' : 'Veedores y mesas'}
        description={
          isProvincial
            ? 'Invita y consulta coordinadores de recintos de tu provincia.'
            : 'Administra veedores, asigna mesas y conserva el historial de reemplazos.'
        }
      />

      {loadStatus === 'loading' && !overview ? (
        <LoadingScreen message="Consultando personal autorizado…" />
      ) : null}
      {loadError ? (
        <View className="gap-3">
          <AuthNotice message={loadError} />
          <PrimaryButton label="Reintentar" onPress={() => void reload()} />
        </View>
      ) : null}
      {actionError ? <AuthNotice message={actionError} /> : null}
      {success ? <AuthNotice message={success} success /> : null}

      {overview ? (
        <>
          <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
            <SectionTitle>
              {isProvincial ? 'Crear coordinador de recinto' : 'Crear veedor'}
            </SectionTitle>
            <Controller
              control={memberForm.control}
              name="fullName"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Nombres y apellidos"
                  autoCapitalize="words"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={memberForm.control}
              name="idCard"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Cédula de identidad"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={memberForm.control}
              name="phone"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Teléfono"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={memberForm.control}
              name="email"
              render={({ field, fieldState }) => (
                <AuthField
                  label="Correo electrónico"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            {isProvincial ? (
              <View className="gap-2">
                <Text className="text-sm font-semibold text-electoral-navy">Recinto</Text>
                {overview.pollingPlaces.length === 0 ? (
                  <AuthNotice message="No hay recintos disponibles en tu provincia." />
                ) : (
                  overview.pollingPlaces.map((place) => (
                    <OptionRow
                      key={place.id}
                      label={place.name}
                      selected={selectedPollingPlaceId === place.id}
                      onPress={() => {
                        memberForm.setValue('pollingPlaceId', place.id, {
                          shouldValidate: true,
                        });
                      }}
                    />
                  ))
                )}
                {memberForm.formState.errors.pollingPlaceId?.message ? (
                  <Text className="text-sm text-electoral-red">
                    {memberForm.formState.errors.pollingPlaceId.message}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {isPrecinct ? (
              <View className="gap-2">
                <Text className="text-sm font-semibold text-electoral-navy">
                  Mesas a asignar
                </Text>
                <Text className="text-sm leading-5 text-electoral-muted">
                  Selecciona una o varias mesas de tu recinto. Las que ya tienen
                  un veedor activo no están disponibles.
                </Text>
                {overview.electoralTables.length === 0 ? (
                  <AuthNotice message="Este recinto aún no tiene mesas registradas." />
                ) : (
                  overview.electoralTables.map((table) => {
                    const assignedTo = assignedTableLabels.get(table.id);
                    const disabled = assignedTo !== undefined;
                    const selected = selectedMemberTableIds.includes(table.id);
                    return (
                      <OptionRow
                        key={table.id}
                        label={
                          disabled
                            ? `Mesa ${table.tableNumber} · Asignada a ${assignedTo}`
                            : `Mesa ${table.tableNumber}`
                        }
                        selected={selected}
                        disabled={disabled}
                        onPress={() => {
                          const current = memberForm.getValues('electoralTableIds');
                          setMemberValue(
                            'electoralTableIds',
                            selected
                              ? current.filter((id) => id !== table.id)
                              : [...current, table.id],
                            { shouldValidate: true },
                          );
                        }}
                      />
                    );
                  })
                )}
                {memberForm.formState.errors.electoralTableIds?.message ? (
                  <Text className="text-sm text-electoral-red">
                    {memberForm.formState.errors.electoralTableIds.message}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <AuthNotice
              message={
                isProvincial
                  ? 'Cada recinto puede tener un coordinador activo. La invitación se enviará por correo.'
                  : 'La invitación se enviará por correo y las mesas elegidas quedarán asignadas al veedor.'
              }
              success
            />
            <PrimaryButton
              label="Enviar invitación"
              loading={actionStatus === 'loading'}
              disabled={
                (isProvincial &&
                  (overview.pollingPlaces.length === 0 || selectedPollingPlaceId === null)) ||
                (isPrecinct && overview.electoralTables.length === 0)
              }
              onPress={() => void memberForm.handleSubmit(submitMember)()}
            />
          </View>

          <View className="gap-3">
            <SectionTitle>
              {isProvincial ? 'Coordinadores registrados' : 'Veedores del recinto'}
            </SectionTitle>
            {overview.members.length === 0 ? (
              <AuthNotice
                message={
                  isProvincial
                    ? 'Aún no hay coordinadores de recinto registrados en tu provincia.'
                    : 'Aún no hay veedores registrados en este recinto.'
                }
                success
              />
            ) : (
              overview.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  locationName={
                    isProvincial && member.pollingPlaceId !== null
                      ? placeNames.get(member.pollingPlaceId)
                      : undefined
                  }
                />
              ))
            )}
          </View>

          {isPrecinct ? (
            <>
              <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5">
                <SectionTitle>Asignar o reemplazar veedor</SectionTitle>
                <Text className="text-sm leading-5 text-electoral-muted">
                  Selecciona un veedor y una o varias mesas. Para reemplazar, selecciona también al
                  veedor saliente; sus asignaciones y actas no se eliminan.
                </Text>
                {activeWatchers.length === 0 ? (
                  <AuthNotice message="Registra primero un veedor activo para asignarle mesas." />
                ) : (
                  <View className="gap-2">
                    <Text className="text-sm font-semibold text-electoral-navy">
                      Nuevo veedor
                    </Text>
                    {activeWatchers.map((watcher) => (
                      <OptionRow
                        key={watcher.id}
                        label={watcher.fullName}
                        selected={selectedWatcherId === watcher.id}
                        onPress={() =>
                          assignmentForm.setValue('watcherId', watcher.id, {
                            shouldValidate: true,
                          })
                        }
                      />
                    ))}
                    {assignmentForm.formState.errors.watcherId?.message ? (
                      <Text className="text-sm text-electoral-red">
                        {assignmentForm.formState.errors.watcherId.message}
                      </Text>
                    ) : null}
                  </View>
                )}

                <View className="gap-2">
                  <Text className="text-sm font-semibold text-electoral-navy">
                    Reemplazar veedor saliente (opcional)
                  </Text>
                  <OptionRow
                    label="No es un reemplazo"
                    selected={!replacingWatcherId}
                    onPress={() => {
                      assignmentForm.setValue('replacingWatcherId', '');
                      assignmentForm.setValue('endReason', '');
                    }}
                  />
                  {allWatchers.map((watcher) => (
                    <OptionRow
                      key={watcher.id}
                      label={`${watcher.fullName}${watcher.isActive ? '' : ' · Cuenta inactiva'}`}
                      selected={replacingWatcherId === watcher.id}
                      onPress={() =>
                        assignmentForm.setValue('replacingWatcherId', watcher.id, {
                          shouldValidate: true,
                        })
                      }
                    />
                  ))}
                </View>

                {replacingWatcherId ? (
                  <Controller
                    control={assignmentForm.control}
                    name="endReason"
                    render={({ field, fieldState }) => (
                      <AuthField
                        label="Motivo del reemplazo"
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                ) : null}

                <View className="gap-2">
                  <Text className="text-sm font-semibold text-electoral-navy">Mesas</Text>
                  {overview.electoralTables.length === 0 ? (
                    <AuthNotice message="Este recinto aún no tiene mesas registradas." />
                  ) : (
                    overview.electoralTables.map((table) => {
                      const selected = selectedTableIds.includes(table.id);
                      return (
                        <OptionRow
                          key={table.id}
                          label={`Mesa ${table.tableNumber}`}
                          selected={selected}
                          onPress={() => {
                            const current = assignmentForm.getValues('electoralTableIds');
                            assignmentForm.setValue(
                              'electoralTableIds',
                              selected
                                ? current.filter((id) => id !== table.id)
                                : [...current, table.id],
                              { shouldValidate: true },
                            );
                          }}
                        />
                      );
                    })
                  )}
                  {assignmentForm.formState.errors.electoralTableIds?.message ? (
                    <Text className="text-sm text-electoral-red">
                      {assignmentForm.formState.errors.electoralTableIds.message}
                    </Text>
                  ) : null}
                </View>
                <PrimaryButton
                  label={replacingWatcherId ? 'Confirmar reemplazo' : 'Guardar asignaciones'}
                  loading={actionStatus === 'loading'}
                  disabled={
                    activeWatchers.length === 0 || overview.electoralTables.length === 0
                  }
                  onPress={() => void assignmentForm.handleSubmit(submitAssignments)()}
                />
              </View>

              <View className="gap-3">
                <SectionTitle>Historial de asignaciones</SectionTitle>
                {overview.assignments.length === 0 ? (
                  <AuthNotice message="Todavía no hay asignaciones para las mesas de este recinto." success />
                ) : (
                  overview.assignments.map((assignment) => {
                    const watcher = overview.members.find(
                      (member) => member.id === assignment.watcherId,
                    );
                    return (
                      <View
                        key={assignment.id}
                        className="gap-1 rounded-xl border border-electoral-border bg-white p-4">
                        <Text className="text-base font-semibold text-electoral-navy">
                          Mesa {assignment.tableNumber} · {watcher?.fullName ?? 'Veedor'}
                        </Text>
                        <Text className="text-sm text-electoral-muted">
                          {assignment.endedAt
                            ? `Finalizada ${new Date(assignment.endedAt).toLocaleDateString('es-EC')}`
                            : 'Asignación activa'}
                        </Text>
                        {assignment.endReason ? (
                          <Text className="text-sm text-electoral-text">
                            Motivo: {assignment.endReason}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </AuthShell>
  );
}
