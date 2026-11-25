import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import authReducer from '@/features/auth/presentation/auth-slice';
import { SupabaseTerritoryRepository } from '@/features/territory/infrastructure/supabase-territory-repository';
import territoryReducer from '@/features/territory/presentation/territory-slice';
import { SupabasePersonnelRepository } from '@/features/personnel/infrastructure/supabase-personnel-repository';
import personnelReducer from '@/features/personnel/presentation/personnel-slice';

const territoryRepository = new SupabaseTerritoryRepository();

export const store = configureStore({
  reducer: { auth: authReducer, territory: territoryReducer, personnel: personnelReducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: {
        extraArgument: {
          territoryRepository,
          personnelRepository: new SupabasePersonnelRepository(territoryRepository),
        },
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
