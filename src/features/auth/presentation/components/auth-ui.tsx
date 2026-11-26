import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LottieAnimation } from "./lottie-animation";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-electoral-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-xl flex-grow justify-center px-5 py-8"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(320)} className="gap-6">
          {children}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppShell({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-electoral-background">
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-xl flex-grow px-5 py-6 pb-12"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(300)} className="gap-5">
          {children}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function RoleHeader({
  badge,
  title,
  subtitle,
  onBack,
  backLabel = "Volver",
}: {
  badge: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <View className="border-b-4 border-electoral-cyan bg-electoral-navy px-5 pb-5 pt-3 shadow-sm">
      <View className="mx-auto w-full max-w-xl gap-2">
        <View className="flex-row items-center justify-between">
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-10 flex-row items-center rounded-lg bg-white/10 px-3 py-1.5 active:opacity-75"
              onPress={onBack}
            >
              <Text className="text-sm font-bold text-white">
                ← {backLabel}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View className="rounded-full bg-electoral-cyan/20 px-3 py-1">
            <Text className="text-xs font-extrabold uppercase tracking-wider text-electoral-cyan">
              {badge}
            </Text>
          </View>
        </View>
        <Text className="mt-1 text-2xl font-extrabold text-white">{title}</Text>
        {subtitle ? (
          <Text className="text-sm leading-5 text-slate-300">{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function AuthBrand() {
  return (
    <View className="overflow-hidden rounded-3xl border-b-4 border-electoral-cyan bg-electoral-navy p-6 shadow-sm">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-8 rounded-full bg-electoral-cyan" />
        <View className="h-2.5 w-3 rounded-full bg-electoral-red" />
      </View>
      <Text className="mt-4 text-xs font-extrabold tracking-[2.5px] text-electoral-cyan">
        CONTROL ELECTORAL · ECUADOR
      </Text>
      <Text className="mt-1 text-2xl font-extrabold leading-8 text-white">
        Monitoreo claro, información confiable.
      </Text>
      <Text className="mt-2 text-sm leading-5 text-slate-300">
        Sistema oficial de escrutinio, evidencia y seguimiento en tiempo real.
      </Text>
    </View>
  );
}

export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View className="gap-1.5 px-1">
      <Text className="text-2xl font-extrabold text-electoral-navy">
        {title}
      </Text>
      <Text className="text-sm leading-5 text-electoral-muted">
        {description}
      </Text>
    </View>
  );
}

export function AuthField({
  label,
  error,
  className,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string; error?: string; className?: string }) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isPasswordField = Boolean(secureTextEntry);

  const inputClassName = `min-h-14 rounded-2xl border-2 bg-white text-base font-medium text-electoral-text ${
    error
      ? "border-electoral-red bg-red-50/30"
      : "border-electoral-border"
  } ${className ?? ""}`;

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-bold uppercase tracking-wide text-electoral-navy">
        {label}
      </Text>

      {isPasswordField ? (
        <View
          className={`min-h-14 flex-row items-center rounded-2xl border-2 bg-white ${
            error
              ? "border-electoral-red bg-red-50/30"
              : "border-electoral-border"
          }`}
        >
          <TextInput
            accessibilityLabel={label}
            className={`min-h-14 flex-1 px-4 text-base font-medium text-electoral-text ${className ?? ""}`}
            placeholderTextColor="#667085"
            secureTextEntry={!passwordVisible}
            {...props}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            accessibilityState={{ selected: passwordVisible }}
            className="min-h-14 min-w-12 items-center justify-center px-3 active:opacity-60"
            onPress={() => setPasswordVisible((visible) => !visible)}
          >
            <Text className="text-xl">
              {passwordVisible ? "🙈" : "👁️"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <TextInput
          accessibilityLabel={label}
          className={`${inputClassName} px-4`}
          placeholderTextColor="#667085"
          {...props}
        />
      )}

      {error ? (
        <Text className="text-xs font-semibold text-electoral-red">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "navy" | "secondary" | "danger";
}) {
  const containerStyles = {
    primary: "bg-electoral-cyan border-electoral-cyan",
    navy: "bg-electoral-navy border-electoral-navy",
    secondary: "bg-white border-electoral-border",
    danger: "bg-white border-electoral-red",
  }[variant];

  const textStyles = {
    primary: "text-electoral-navy",
    navy: "text-white",
    secondary: "text-electoral-navy",
    danger: "text-electoral-red",
  }[variant];

  const spinnerColor = variant === "navy" ? "#FFFFFF" : "#17324D";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={`min-h-14 items-center justify-center rounded-2xl border-2 px-5 shadow-xs active:scale-[0.99] active:opacity-85 disabled:opacity-45 ${containerStyles}`}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text className={`text-base font-extrabold ${textStyles}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function AuthNotice({
  message,
  success = false,
}: {
  message: string;
  success?: boolean;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      accessibilityRole="alert"
      className={`flex-row items-start gap-3 rounded-2xl border-l-4 px-4 py-3.5 ${
        success
          ? "border-l-electoral-cyan border border-electoral-cyan/40 bg-electoral-cyan-light"
          : "border-l-electoral-red border border-electoral-red/30 bg-red-50"
      }`}
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full ${
          success ? "bg-electoral-cyan" : "bg-electoral-red"
        }`}
      >
        <Text className="text-xs font-extrabold text-white">
          {success ? "✓" : "!"}
        </Text>
      </View>
      <Text
        className={`flex-1 text-sm font-medium leading-5 ${
          success ? "text-electoral-navy" : "text-electoral-red"
        }`}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

export function StatusBadge({
  label,
  tone = "cyan",
}: {
  label: string;
  tone?: "cyan" | "navy" | "red" | "neutral";
}) {
  const styles = {
    cyan: "bg-electoral-cyan-light border-electoral-cyan/40 text-electoral-navy",
    navy: "bg-electoral-navy border-electoral-navy text-white",
    red: "bg-red-50 border-electoral-red/40 text-electoral-red",
    neutral: "bg-slate-100 border-slate-200 text-electoral-muted",
  }[tone];

  return (
    <View className={`self-start rounded-full border px-3 py-1 ${styles}`}>
      <Text className={`text-xs font-bold ${styles.split(" ").pop()}`}>
        {label}
      </Text>
    </View>
  );
}

export function TextLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-11 items-center justify-center py-2 active:opacity-70"
      onPress={onPress}
    >
      <Text className="text-sm font-bold text-electoral-navy underline">
        {label}
      </Text>
    </Pressable>
  );
}

export function LoadingScreen({
  message = "Verificando tu sesión…",
}: {
  message?: string;
}) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-electoral-background px-6">
      <View className="items-center gap-4 rounded-3xl border border-electoral-border bg-white p-8 shadow-sm">
        <LottieAnimation
          loop
          size={96}
          source={require("../../../../../assets/lottie/loading-scan.json")}
        />
        <Text className="text-center text-base font-semibold text-electoral-navy">
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}
