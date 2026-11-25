import { Text, View } from 'react-native';

import type { ElectoralActValidation } from '@/features/acts/domain/electoral-act';

export function ActValidationFeedback({
  validation,
}: {
  validation: ElectoralActValidation;
}) {
  if (validation.isValid) {
    return (
      <View
        accessibilityRole="summary"
        className="rounded-xl border border-electoral-cyan bg-electoral-cyan-light px-4 py-3">
        <Text className="text-sm font-semibold text-electoral-navy">
          Los valores cumplen la validación aritmética.
        </Text>
      </View>
    );
  }

  if (validation.issues.length === 0) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className="gap-2 rounded-xl border border-electoral-red bg-white px-4 py-3">
      <Text className="text-sm font-bold text-electoral-navy">
        Revisa los datos del acta:
      </Text>
      {validation.issues.map((issue, index) => (
        <Text
          key={`${issue.path.join('.')}-${index}`}
          className="text-sm leading-5 text-electoral-red">
          - {issue.message}
        </Text>
      ))}
    </View>
  );
}
