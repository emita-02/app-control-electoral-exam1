import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import {
  AuthBrand,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthShell,
  LoadingScreen,
  PrimaryButton,
  TextLink,
} from '@/features/auth/presentation/components/auth-ui';
import { useAuthActions } from '@/features/auth/presentation/auth-context';
import { useAppSelector } from '@/store/store';
import type { AuthStackParamList } from '@/navigation/types';

const passwordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmation: z.string().min(1, 'Confirma la contraseña.'),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmation'],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { updatePassword } = useAuthActions();
  const { error, passwordRecovery, status } = useAppSelector((state) => state.auth);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  if (status !== 'authenticated' || !passwordRecovery) {
    if (status === 'loading' || (passwordRecovery && status === 'unauthenticated')) {
      return <LoadingScreen message="Validando el enlace de recuperación…" />;
    }
    return (
      <AuthShell>
        <AuthBrand />
        <AuthHeading
          title="Enlace no válido"
          description="Solicita un nuevo enlace para cambiar tu contraseña."
        />
        {error ? <AuthNotice message={error} /> : null}
        <TextLink
          label="Volver a recuperación"
          onPress={() => navigation.navigate('ForgotPassword')}
        />
      </AuthShell>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await updatePassword(password);
    } catch {
      // The authentication provider exposes a safe message in the shared state.
    }
  });

  return (
    <AuthShell>
      <AuthBrand />
      <AuthHeading
        title="Crear contraseña nueva"
        description="Elige una contraseña segura de al menos 8 caracteres."
      />
      <View className="gap-5">
        {error ? <AuthNotice message={error} /> : null}
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <AuthField
              autoCapitalize="none"
              autoComplete="new-password"
              error={fieldState.error?.message}
              label="Nueva contraseña"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              secureTextEntry
              textContentType="newPassword"
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="confirmation"
          render={({ field, fieldState }) => (
            <AuthField
              autoCapitalize="none"
              autoComplete="new-password"
              error={fieldState.error?.message}
              label="Confirmar contraseña"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              secureTextEntry
              textContentType="newPassword"
              value={field.value}
            />
          )}
        />
        <PrimaryButton
          label="Actualizar contraseña"
          loading={isSubmitting}
          onPress={onSubmit}
        />
      </View>
    </AuthShell>
  );
}
