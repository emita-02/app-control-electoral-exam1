import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import type { NetworkStatus } from '@/features/offline/domain/network-status';

function isConnected(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export class NetInfoNetworkStatus implements NetworkStatus {
  async isOnline(): Promise<boolean> {
    return isConnected(await NetInfo.fetch());
  }

  subscribe(listener: (online: boolean) => void): () => void {
    return NetInfo.addEventListener((state) => {
      listener(isConnected(state));
    });
  }
}
