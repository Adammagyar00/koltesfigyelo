// A `firebase/auth` csomag típusai a webes buildből jönnek, de React Native-on (Metro) a natív build
// töltődik be, ami exportálja a getReactNativePersistence-t is. Ezt a típust pótoljuk itt.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
