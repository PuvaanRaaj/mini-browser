import type { AuthenticatorAccount } from "./totp";

export type VaultStatus = {
  available: boolean;
  backend: string;
  message: string | null;
};

export type AuthenticatorCode = Omit<AuthenticatorAccount, "secret"> & {
  code: string;
  remaining: number;
};

export type PasswordEntry = {
  id: string;
  origin: string;
  username: string;
  createdAt: number;
  updatedAt: number;
};

export type PasswordInput = {
  origin: string;
  username: string;
  password: string;
};

export type VaultAPI = {
  status: () => Promise<VaultStatus>;
  listAuthenticatorCodes: () => Promise<AuthenticatorCode[]>;
  importAuthenticatorAccounts: (accounts: AuthenticatorAccount[]) => Promise<number>;
  deleteAuthenticatorAccount: (id: string) => Promise<void>;
  listPasswords: () => Promise<PasswordEntry[]>;
  savePassword: (input: PasswordInput) => Promise<PasswordEntry>;
  deletePassword: (id: string) => Promise<void>;
  fillPassword: (id: string) => Promise<void>;
};

export type GoogleAuthStatus = {
  configured: boolean;
  signedIn: boolean;
};

export type GoogleAuthAPI = {
  status: () => Promise<GoogleAuthStatus>;
  signIn: () => Promise<GoogleAuthStatus>;
  signOut: () => Promise<GoogleAuthStatus>;
};
