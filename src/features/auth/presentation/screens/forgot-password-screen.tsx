import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

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

const recoverySchema = z.object({
  email: z.email('Ingresa un correo electrónico válido.'),
});

type RecoveryValues = z.infer<typeof recoverySchema>;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { requestPasswordRecovery } = useAuthActions();
  const authError = useAppSelector((state) => state.auth.error);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSent(false);
    try {
      await requestPasswordRecovery(email);
      setSent(true);
    } catch {
      // The authentication provider exposes a safe message in the shared state.
    }
  });

  return (
    <AuthShell>
      <AuthBrand />
      <AuthHeading
        title="Recuperar contraseña"
        description="Te enviaremos un enlace al correo asociado a tu cuenta."
      />
      <View className="gap-5">
        {authError ? <AuthNotice message={authError} /> : null}
        {sent ? (
          <AuthNotice
            message="Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña."
            success
          />
        ) : null}
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
              returnKeyType="send"
              textContentType="emailAddress"
              value={field.value}
            />
          )}
        />
        <PrimaryButton
          label="Enviar enlace"
          loading={isSubmitting}
          onPress={onSubmit}
        />
        <TextLink
          label="Volver al inicio de sesión"
          onPress={() => navigation.navigate('Login')}
        />
      </View>
    </AuthShell>
  );
}
