import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { View } from 'react-native';

import {
  AuthBrand,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthShell,
  PrimaryButton,
  TextLink,
} from '@/features/auth/presentation/components/auth-ui';
import { useAuthActions } from '@/features/auth/presentation/auth-context';
import { useAppSelector } from '@/store/store';
import type { AuthStackParamList } from '@/navigation/types';

const loginSchema = z.object({
  email: z.email('Ingresa un correo electrónico válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { retryProfile, signIn, signOut } = useAuthActions();
  const { error: authError, userId } = useAppSelector((state) => state.auth);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
    } catch {
      // The authentication provider exposes a safe message in the shared state.
    }
  });

  return (
    <AuthShell>
      <AuthBrand />
      <AuthHeading
        title="Iniciar sesión"
        description="Ingresa con la cuenta que te asignó tu coordinador."
      />

      <View className="gap-5">
        {authError ? <AuthNotice message={authError} /> : null}
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <AuthField
              autoCapitalize="none"
              autoComplete="email"
              error={fieldState.error?.message}
              keyboardType="email-address"
              label="Correo electrónico"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              returnKeyType="next"
              textContentType="emailAddress"
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <AuthField
              autoCapitalize="none"
              autoComplete="current-password"
              error={fieldState.error?.message}
              label="Contraseña"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              secureTextEntry
              textContentType="password"
              value={field.value}
            />
          )}
        />
        <PrimaryButton label="Ingresar" loading={isSubmitting} onPress={onSubmit} />
        {userId ? (
          <>
            <PrimaryButton
              label="Reintentar validación del perfil"
              onPress={() => {
                void retryProfile().catch(() => undefined);
              }}
            />
            <PrimaryButton
              label="Cerrar sesión de esta cuenta"
              onPress={() => {
                void signOut().catch(() => undefined);
              }}
            />
          </>
        ) : null}
        <TextLink
          label="¿Olvidaste tu contraseña?"
          onPress={() => navigation.navigate('ForgotPassword')}
        />
      </View>
    </AuthShell>
  );
}
