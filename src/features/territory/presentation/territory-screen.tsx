import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { userRoles } from '@/features/auth/domain/user-profile';
import {
  AuthField,
  AuthNotice,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import type { Canton, ProvinceTerritory } from '@/features/territory/domain/territory';
import {
  fetchProvinceTerritory,
  registerPollingPlace,
} from '@/features/territory/presentation/territory-slice';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

type Props = NativeStackScreenProps<WorkspaceStackParamList, 'TerritorialStructure'>;

const pollingPlaceFormSchema = z.object({
  parishId: z.number().int().positive('Selecciona una parroquia.'),
  name: z.string().trim().min(1, 'Ingresa el nombre del recinto.'),
  code: z.string(),
  address: z.string(),
  tableCount: z
    .string()
    .trim()
    .min(1, 'Ingresa la cantidad de mesas electorales.')
    .regex(/^\d+$/, 'Ingresa un entero positivo, sin decimales ni signos.')
    .refine((value) => Number(value) >= 1 && Number(value) <= 100, {
      message: 'Ingresa una cantidad de mesas de 1 a 100.',
    }),
});

type PollingPlaceFormValues = z.infer<typeof pollingPlaceFormSchema>;

function countTerritory(province: ProvinceTerritory) {
  return province.cantons.reduce(
    (totals, canton) => {
      totals.parishes += canton.parishes.length;
      for (const parish of canton.parishes) {
        totals.pollingPlaces += parish.pollingPlaces.length;
        for (const pollingPlace of parish.pollingPlaces) {
          totals.electoralTables += pollingPlace.electoralTables.length;
        }
      }
      return totals;
    },
    {
      cantons: province.cantons.length,
      parishes: 0,
      pollingPlaces: 0,
      electoralTables: 0,
    },
  );
}

function quantity(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function TerritoryEntry({
  title,
  details,
  childSummary,
  expanded,
  onPress,
  children,
}: {
  title: string;
  details?: string;
  childSummary?: string;
  expanded?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const content = (
    <>
      <Text className="text-base font-semibold text-electoral-navy">{title}</Text>
      {details ? <Text className="mt-1 text-sm text-electoral-muted">{details}</Text> : null}
      {childSummary ? (
        <Text className="mt-2 text-sm font-medium text-electoral-text">
          {childSummary}
          {onPress ? (expanded ? ' · Ocultar' : ' · Ver') : null}
        </Text>
      ) : null}
    </>
  );

  return (
    <View className="rounded-xl border border-electoral-border bg-white p-4">
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="min-h-11 justify-center"
          onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        <View className="min-h-11 justify-center">{content}</View>
      )}
      {expanded && children ? (
        <View className="ml-2 mt-3 gap-3 border-l border-electoral-border pl-3">
          {children}
        </View>
      ) : null}
    </View>
  );
}

function renderCanton(
  canton: Canton,
  expanded: boolean,
  expandedNodes: Set<string>,
  toggle: (key: string) => void,
) {
  const key = `canton:${canton.id}`;
  const parishes = canton.parishes;

  return (
    <TerritoryEntry
      key={key}
      title={canton.name}
      details={canton.code ?? undefined}
      childSummary={quantity(parishes.length, 'parroquia', 'parroquias')}
      expanded={expanded}
      onPress={parishes.length > 0 ? () => toggle(key) : undefined}>
      {parishes.map((parish) => {
        const parishKey = `parish:${parish.id}`;
        return (
          <TerritoryEntry
            key={parishKey}
            title={parish.name}
            details={[parish.code, parish.type].filter(Boolean).join(' · ') || undefined}
            childSummary={quantity(parish.pollingPlaces.length, 'recinto', 'recintos')}
            expanded={expandedNodes.has(parishKey)}
            onPress={
              parish.pollingPlaces.length > 0 ? () => toggle(parishKey) : undefined
            }>
            {parish.pollingPlaces.map((pollingPlace) => {
              const placeKey = `place:${pollingPlace.id}`;
              return (
                <TerritoryEntry
                  key={placeKey}
                  title={pollingPlace.name}
                  details={
                    [pollingPlace.code, pollingPlace.address].filter(Boolean).join(' · ') ||
                    undefined
                  }
                  childSummary={quantity(
                    pollingPlace.electoralTables.length,
                    'mesa',
                    'mesas',
                  )}
                  expanded={expandedNodes.has(placeKey)}
                  onPress={
                    pollingPlace.electoralTables.length > 0
                      ? () => toggle(placeKey)
                      : undefined
                  }>
                  {pollingPlace.electoralTables.map((table) => (
                    <TerritoryEntry
                      key={`table:${table.id}`}
                      title={`Mesa ${table.tableNumber}`}
                    />
                  ))}
                </TerritoryEntry>
              );
            })}
          </TerritoryEntry>
        );
      })}
    </TerritoryEntry>
  );
}

export function TerritoryScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.auth.profile);
  const { province: loadedProvince, status, error } = useAppSelector(
    (state) => state.territory,
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const canView = profile?.role === userRoles.provincialCoordinator;
  const provinceId = canView ? profile?.provinceId ?? null : null;
  const province =
    loadedProvince?.id === provinceId ? loadedProvince : null;
  const { control, handleSubmit, reset, formState } =
    useForm<PollingPlaceFormValues>({
      resolver: zodResolver(pollingPlaceFormSchema),
      defaultValues: {
        parishId: 0,
        name: '',
        code: '',
        address: '',
        tableCount: '',
      },
    });
  const { createError, createStatus } = useAppSelector((state) => state.territory);
  const parishOptions =
    province?.cantons.flatMap((canton) =>
      canton.parishes.map((parish) => ({
        ...parish,
        cantonName: canton.name,
      })),
    ) ?? [];

  useEffect(() => {
    if (provinceId !== null) {
      void dispatch(fetchProvinceTerritory(provinceId));
    }
  }, [dispatch, provinceId]);

  const toggleNode = (key: string) => {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const onCreatePollingPlace = handleSubmit(async (values) => {
    const result = await dispatch(
      registerPollingPlace({
        ...values,
        tableCount: Number(values.tableCount),
        code: values.code.trim() || null,
        address: values.address.trim() || null,
      }),
    );

    if (registerPollingPlace.fulfilled.match(result)) {
      reset({ parishId: 0, name: '', code: '', address: '', tableCount: '' });
      if (provinceId !== null) {
        void dispatch(fetchProvinceTerritory(provinceId));
      }
    }
  });

  if (!canView) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-electoral-background p-6">
        <AuthNotice message="Esta consulta está disponible únicamente para el coordinador provincial." />
        <Pressable
          accessibilityRole="button"
          className="mt-4 min-h-11 justify-center"
          onPress={() => navigation.goBack()}>
          <Text className="font-semibold text-electoral-navy">Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const totals = province ? countTerritory(province) : null;
  const hasTerritorialEntries =
    totals !== null &&
    (totals.cantons > 0 ||
      totals.parishes > 0 ||
      totals.pollingPlaces > 0 ||
      totals.electoralTables > 0);

  return (
    <SafeAreaView className="flex-1 bg-electoral-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-2xl gap-5 px-5 py-6">
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 self-start justify-center"
            onPress={() => navigation.goBack()}>
            <Text className="font-semibold text-electoral-navy">Volver</Text>
          </Pressable>
          <Text className="text-2xl font-bold text-electoral-navy">
            Estructura territorial
          </Text>
          <Text className="text-base leading-6 text-electoral-muted">
            Consulta la jurisdicción asignada y su organización electoral.
          </Text>
        </View>

        {provinceId === null ? (
          <AuthNotice message="Tu perfil no tiene una provincia asignada. Solicita que revisen tu jurisdicción." />
        ) : null}

        {provinceId !== null && status === 'loading' ? (
          <View className="min-h-32 items-center justify-center gap-3">
            <ActivityIndicator
              accessibilityLabel="Cargando estructura territorial"
              color="#00AEEF"
              size="large"
            />
            <Text className="text-base text-electoral-muted">Cargando información territorial…</Text>
          </View>
        ) : null}

        {provinceId !== null && status === 'failed' && error ? (
          <AuthNotice message={error} />
        ) : null}

        {provinceId !== null && status === 'failed' ? (
          <PrimaryButton
            label="Reintentar consulta"
            onPress={() => {
              if (provinceId !== null) {
                void dispatch(fetchProvinceTerritory(provinceId));
              }
            }}
          />
        ) : null}

        {province && totals ? (
          <>
            <View className="gap-1 rounded-2xl border border-electoral-border bg-white p-5">
              <Text className="text-lg font-bold text-electoral-navy">{province.name}</Text>
              <Text className="text-sm leading-5 text-electoral-muted">
                {quantity(totals.cantons, 'cantón', 'cantones')} ·{' '}
                {quantity(totals.parishes, 'parroquia', 'parroquias')} ·{' '}
                {quantity(totals.pollingPlaces, 'recinto', 'recintos')} ·{' '}
                {quantity(totals.electoralTables, 'mesa', 'mesas')}
              </Text>
            </View>

            <View className="gap-5 rounded-2xl border border-electoral-border bg-white p-5">
              <View className="gap-2">
                <Text className="text-lg font-bold text-electoral-navy">
                  Agregar recinto
                </Text>
                <Text className="text-sm leading-5 text-electoral-muted">
                  El recinto se asociará a una parroquia de tu provincia y se
                  crearán sus mesas automáticamente.
                </Text>
              </View>

              <Controller
                control={control}
                name="parishId"
                render={({ field, fieldState }) => (
                  <View className="gap-2">
                    <Text className="text-sm font-semibold text-electoral-navy">
                      Parroquia
                    </Text>
                    {parishOptions.length > 0 ? (
                      <View className="gap-2">
                        {parishOptions.map((parish) => {
                          const selected = field.value === parish.id;
                          return (
                            <Pressable
                              key={parish.id}
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: selected,
                                disabled: formState.isSubmitting,
                              }}
                              className={`min-h-12 justify-center rounded-xl border px-4 py-3 ${
                                selected
                                  ? 'border-electoral-cyan bg-electoral-cyan-light'
                                  : 'border-electoral-border bg-white'
                              }`}
                              disabled={formState.isSubmitting}
                              onBlur={field.onBlur}
                              onPress={() => field.onChange(parish.id)}>
                              <Text className="text-base font-semibold text-electoral-navy">
                                {parish.name}
                              </Text>
                              <Text className="text-sm text-electoral-muted">
                                {parish.cantonName}
                                {parish.type ? ` · ${parish.type}` : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <AuthNotice message="No hay parroquias disponibles para asociar un recinto." />
                    )}
                    {fieldState.error ? (
                      <Text className="text-sm text-electoral-red">
                        {fieldState.error.message}
                      </Text>
                    ) : null}
                  </View>
                )}
              />

              <Controller
                control={control}
                name="name"
                render={({ field, fieldState }) => (
                  <AuthField
                    autoCapitalize="words"
                    error={fieldState.error?.message}
                    label="Nombre del recinto"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    returnKeyType="next"
                    value={field.value}
                  />
                )}
              />

              <Controller
                control={control}
                name="tableCount"
                render={({ field, fieldState }) => (
                  <AuthField
                    error={fieldState.error?.message}
                    keyboardType="number-pad"
                    label="Cantidad de mesas electorales"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    returnKeyType="next"
                    value={field.value}
                  />
                )}
              />
              <Text className="-mt-3 text-xs text-electoral-muted">
                Cantidad permitida: de 1 a 100 mesas.
              </Text>

              <Controller
                control={control}
                name="code"
                render={({ field, fieldState }) => (
                  <AuthField
                    autoCapitalize="characters"
                    error={fieldState.error?.message}
                    label="Código (opcional)"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    returnKeyType="next"
                    value={field.value}
                  />
                )}
              />

              <Controller
                control={control}
                name="address"
                render={({ field, fieldState }) => (
                  <AuthField
                    autoCapitalize="sentences"
                    error={fieldState.error?.message}
                    label="Dirección (opcional)"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    returnKeyType="done"
                    value={field.value}
                  />
                )}
              />

              {createError ? <AuthNotice message={createError} /> : null}
              {createStatus === 'succeeded' ? (
                <AuthNotice
                  message="El recinto se registró correctamente."
                  success
                />
              ) : null}
              <PrimaryButton
                disabled={parishOptions.length === 0}
                label="Registrar recinto"
                loading={formState.isSubmitting || createStatus === 'loading'}
                onPress={onCreatePollingPlace}
              />
            </View>

            {hasTerritorialEntries ? (
              <View className="gap-3">
                {province.cantons.map((canton) => {
                  const key = `canton:${canton.id}`;
                  return renderCanton(
                    canton,
                    expandedNodes.has(key),
                    expandedNodes,
                    toggleNode,
                  );
                })}
              </View>
            ) : status === 'succeeded' ? (
              <AuthNotice message="La provincia está registrada, pero todavía no tiene cantones, parroquias, recintos o mesas asociados." />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
