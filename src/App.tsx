import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { AuthProvider } from '@/features/auth/presentation/auth-context';
import { AppNavigator } from '@/navigation/app-navigator';
import { store } from '@/store/store';

export default function App() {
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
