import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-electoral-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-xl flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled">
        <View className="gap-8">{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AuthBrand() {
  return (
    <View className="gap-3">
      <View className="h-1 w-16 rounded-full bg-electoral-red" />
      <Text className="text-sm font-bold tracking-[2px] text-electoral-navy">
        CONTROL ELECTORAL
      </Text>
      <Text className="text-3xl font-bold leading-10 text-electoral-navy">
        Monitoreo claro, información confiable.
      </Text>
    </View>
  );
}

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <View className="gap-2">
      <Text className="text-2xl font-bold text-electoral-navy">{title}</Text>
      <Text className="text-base leading-6 text-electoral-muted">{description}</Text>
    </View>
  );
}

export function AuthField({
  label,
  error,
  className,
  ...props
}: TextInputProps & { label: string; error?: string; className?: string }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-electoral-navy">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={`min-h-14 rounded-xl border bg-white px-4 text-base text-electoral-text ${
          error ? 'border-electoral-red' : 'border-electoral-border'
        } ${className ?? ''}`}
        placeholderTextColor="#667085"
        {...props}
      />
      {error ? <Text className="text-sm text-electoral-red">{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className="min-h-14 items-center justify-center rounded-xl bg-electoral-cyan px-5 active:opacity-80 disabled:opacity-50"
      disabled={disabled || loading}
      onPress={onPress}>
      {loading ? (
        <ActivityIndicator color="#17324D" />
      ) : (
        <Text className="text-base font-bold text-electoral-navy">{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthNotice({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <View
      accessibilityRole="alert"
      className={`rounded-xl border px-4 py-3 ${
        success
          ? 'border-electoral-cyan bg-electoral-cyan-light'
          : 'border-electoral-red bg-white'
      }`}>
      <Text className={`text-sm leading-5 ${success ? 'text-electoral-navy' : 'text-electoral-red'}`}>
        {message}
      </Text>
    </View>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-11 items-center justify-center py-2"
      onPress={onPress}>
      <Text className="text-base font-semibold text-electoral-navy underline">{label}</Text>
    </Pressable>
  );
}

export function LoadingScreen({ message = 'Verificando tu sesión…' }: { message?: string }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-electoral-background px-6">
      <ActivityIndicator color="#00AEEF" size="large" />
      <Text className="text-base text-electoral-muted">{message}</Text>
    </SafeAreaView>
  );
}
