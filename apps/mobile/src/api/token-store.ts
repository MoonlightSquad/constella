import { STORAGE_KEYS, clearSecret, readSecret, writeSecret } from '@/storage';

export const readToken = () => readSecret(STORAGE_KEYS.token);

export const saveToken = (token: string) => writeSecret(STORAGE_KEYS.token, token);

export const dropToken = () => clearSecret(STORAGE_KEYS.token);
