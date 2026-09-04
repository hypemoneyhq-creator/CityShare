import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface VerificationStatus {
  phoneVerified: boolean;
  idVerified: boolean;
}

export interface UserProfile {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  isRider: boolean;
  isPartner: boolean;
  verification: VerificationStatus;
}

export const api = {
  startPhoneVerification: (phone: string) =>
    request<{ sent: true; devCode?: string }>('/api/auth/phone/start', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyPhoneCode: (phone: string, code: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  submitIdentity: (token: string, ghanaCardNumber: string, selfieImage: string) =>
    request<{ user: UserProfile }>(
      '/api/auth/identity',
      { method: 'POST', body: JSON.stringify({ ghanaCardNumber, selfieImage }) },
      token,
    ),

  me: (token: string) => request<{ user: UserProfile }>('/api/auth/me', {}, token),
};
