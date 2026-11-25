import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import authReducer from '@/features/auth/presentation/auth-slice';
import { SupabaseTerritoryRepository } from '@/features/territory/infrastructure/supabase-territory-repository';
import territoryReducer from '@/features/territory/presentation/territory-slice';

export const store = configureStore({
  reducer: { auth: authReducer, territory: territoryReducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: {
        extraArgument: {
          territoryRepository: new SupabaseTerritoryRepository(),
        },
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
