import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Para renderizado estático se devuelve 'light' en el servidor y el esquema real
 * del dispositivo después de la hidratación, sin setState dentro de un efecto.
 */
const subscribe = () => () => undefined;
const getServerSnapshot = () => 'light' as const;

export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  return useSyncExternalStore(subscribe, () => colorScheme, getServerSnapshot);
}
