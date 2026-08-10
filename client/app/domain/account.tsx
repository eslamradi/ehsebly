import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type Account = {
  userId: string;
  email: string;
  displayName: string | null;
};

type AccountContextValue = {
  account: Account | null;
  token: string | null;
  isLoading: boolean;
  signIn: (account: Account, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Updates the cached displayName after a successful server-side save
  // (AccountScreen) — mirrors signIn's write-through-to-storage pattern so
  // the new name survives an app restart without a re-fetch.
  updateDisplayName: (displayName: string) => Promise<void>;
};

const ACCOUNT_STORAGE_KEY = 'asemly:account';
// expo-secure-store keys must be alphanumeric plus ".", "-", "_" only (no
// colon) — unlike AsyncStorage above, which has no such restriction. A
// colon here throws "Invalid key provided to SecureStore" on every
// platform, not just web (found via web-preview testing, confirmed to
// also silently break sign-in on-device: it throws inside signIn() right
// after a successful verify, before the screen navigates away).
const TOKEN_SECURE_STORE_KEY = 'asemly_authToken';

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

/**
 * Owns the signed-in account — separate from SplitSession (session.tsx),
 * which is transient per-split-flow UI state. This persists across app
 * restarts and outlives any one split. The bearer token is a credential and
 * goes in the OS keychain via expo-secure-store; the non-secret profile
 * fields are cached in AsyncStorage purely so the UI can render signed-in
 * state immediately on boot rather than waiting on a SecureStore read.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedAccountJson, storedToken] = await Promise.all([
        AsyncStorage.getItem(ACCOUNT_STORAGE_KEY),
        SecureStore.getItemAsync(TOKEN_SECURE_STORE_KEY),
      ]);
      if (cancelled) {
        return;
      }
      if (storedAccountJson && storedToken) {
        try {
          setAccount(JSON.parse(storedAccountJson) as Account);
          setToken(storedToken);
        } catch {
          // Malformed cache — treat as signed out rather than crash.
        }
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (nextAccount: Account, nextToken: string) => {
    setAccount(nextAccount);
    setToken(nextToken);
    await Promise.all([
      AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(nextAccount)),
      SecureStore.setItemAsync(TOKEN_SECURE_STORE_KEY, nextToken),
    ]);
  };

  const signOut = async () => {
    setAccount(null);
    setToken(null);
    await Promise.all([AsyncStorage.removeItem(ACCOUNT_STORAGE_KEY), SecureStore.deleteItemAsync(TOKEN_SECURE_STORE_KEY)]);
  };

  const updateDisplayName = async (displayName: string) => {
    setAccount((previous) => {
      if (!previous) {
        return previous;
      }
      const next = { ...previous, displayName };
      AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // Best-effort cache write — the server-side save already succeeded
        // by the time this is called (AccountScreen awaits updateAccountName
        // first); a failed local cache write just means a stale name shows
        // again until the next successful sign-in, not a lost update.
      });
      return next;
    });
  };

  const value = useMemo(
    () => ({ account, token, isLoading, signIn, signOut, updateDisplayName }),
    [account, token, isLoading],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}
