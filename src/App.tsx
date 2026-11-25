import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { AuthProvider } from '@/features/auth/presentation/auth-context';
import { AppNavigator } from '@/navigation/app-navigator';
import { appDependencies, store } from '@/store/store';

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler(): ErrorHandler;
  setGlobalHandler(handler: ErrorHandler): void;
};

function useGlobalErrorReporting(): void {
  useEffect(() => {
    const errorUtils = (
      globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike }
    ).ErrorUtils;
    if (!errorUtils) {
      return;
    }

    const previousHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      void appDependencies.errorReporter.report(error, {
        screen: 'Aplicación',
        operation: isFatal === true ? 'error_fatal' : 'error_js',
        details: { isFatal: isFatal === true },
      });
      previousHandler(error, isFatal);
    });

    return () => {
      errorUtils.setGlobalHandler(previousHandler);
    };
  }, []);
}

export default function App() {
  useGlobalErrorReporting();

  return (
    <Provider store={store}>
      <AuthProvider>
        <SafeAreaProvider>
          <AppNavigator />
        </SafeAreaProvider>
      </AuthProvider>
    </Provider>
  );
}
