# Frontend Guide: Implementing 2FA

This guide explains how to implement the API's authenticator-based 2FA flow from a mobile frontend. The flow is complete for the classroom sandbox API.

## What Is Implemented

The backend supports:

- starting 2FA setup
- enabling 2FA with an authenticator code
- showing one-time recovery codes
- requiring 2FA during login
- verifying login with either authenticator code or recovery code
- regenerating recovery codes
- disabling 2FA

Important note: this is a teaching sandbox. The flow is realistic, but passwords and storage are intentionally simple compared with production banking or exchange systems.

## Endpoint Summary

| Screen | Endpoint | Auth required |
| --- | --- | --- |
| 2FA setup QR | `POST /auth/2fa/setup` | Yes |
| Enable 2FA | `POST /auth/2fa/enable` | Yes |
| Login | `POST /auth/login` | No |
| Verify 2FA challenge | `POST /auth/2fa/verify` | No |
| Regenerate recovery codes | `POST /auth/2fa/recovery-codes/regenerate` | Yes |
| Disable 2FA | `POST /auth/2fa/disable` | Yes |

Use the normal auth header for protected endpoints:

```http
Authorization: Bearer <accessToken>
```

## Recommended Frontend Screens

1. **Security Settings**
   Show whether 2FA is enabled.

2. **2FA Setup**
   Call setup, show the QR code, show the manual key, and ask the user for a 6-digit authenticator code.

3. **Recovery Codes**
   Show recovery codes once after enabling or regenerating. Ask the user to confirm they saved them.

4. **2FA Login Challenge**
   Show this after login returns `requiresTwoFactor: true`.

5. **Disable 2FA Confirmation**
   Ask for password plus authenticator code or recovery code.

## Flow 1: Enable 2FA

### Step 1: Start Setup

The user must already be signed in.

```http
POST /auth/2fa/setup
Authorization: Bearer <accessToken>
```

Example response:

```json
{
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/CryptoClass:student%40cryptoclass.test?secret=JBSWY3DPEHPK3PXP&issuer=CryptoClass",
    "enabled": false
  }
}
```

Frontend behavior:

- Render `otpauthUri` as a QR code.
- Also show `secret` as a manual setup key.
- Ask the user to enter the 6-digit code from their authenticator app.

### Step 2: Enable 2FA

```http
POST /auth/2fa/enable
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "code": "123456"
}
```

Example success response:

```json
{
  "data": {
    "enabled": true,
    "recoveryCodes": [
      "A1B2C-D3E4F",
      "8A9B0-C1D2E"
    ],
    "recoveryCodeCount": 8
  }
}
```

Frontend behavior:

- Save the user's updated security state locally if needed.
- Show the `recoveryCodes` on the next screen.
- Tell the user these codes are shown once.
- Do not hide this behind a toast only. It needs a full screen or bottom sheet.

Common error:

```json
{
  "error": {
    "code": "INVALID_TWO_FACTOR_CODE",
    "message": "Invalid authenticator code."
  }
}
```

## Flow 2: Login With 2FA Enabled

### Step 1: Submit Login

```http
POST /auth/login
Content-Type: application/json

{
  "loginType": "email",
  "identifier": "student@cryptoclass.test",
  "password": "student123"
}
```

If 2FA is not enabled, login returns tokens immediately.

If 2FA is enabled, login returns a challenge instead:

```json
{
  "data": {
    "requiresTwoFactor": true,
    "challengeId": "2fa_abc123",
    "attemptsRemaining": 5,
    "expiresAt": "2026-05-22T12:30:00.000Z"
  }
}
```

Frontend behavior:

- Do not treat this as a failed login.
- Navigate to the 2FA verification screen.
- Store `challengeId`, `attemptsRemaining`, and `expiresAt` in screen state.
- Do not store it as a logged-in session yet. The user is not authenticated until `/auth/2fa/verify` succeeds.

### Step 2: Verify With Authenticator Code

```http
POST /auth/2fa/verify
Content-Type: application/json

{
  "challengeId": "2fa_abc123",
  "code": "123456"
}
```

Success response returns the normal login session:

```json
{
  "data": {
    "user": {
      "id": "usr_student",
      "role": "customer",
      "fullName": "Ada Student",
      "email": "student@cryptoclass.test",
      "phone": "+2348010000001",
      "twoFactorEnabled": true
    },
    "accessToken": "demo-token",
    "token": "demo-token",
    "refreshToken": "demo-refresh-token",
    "tokenType": "Bearer",
    "expiresInSeconds": 1800
  }
}
```

Frontend behavior:

- Store `accessToken` and `refreshToken`.
- Navigate into the app.
- Clear the temporary challenge state.

### Step 3: Verify With Recovery Code

Use this when the user lost access to their authenticator app.

```http
POST /auth/2fa/verify
Content-Type: application/json

{
  "challengeId": "2fa_abc123",
  "recoveryCode": "A1B2C-D3E4F"
}
```

Important:

- Send either `code` or `recoveryCode`.
- Do not send both.
- Recovery codes are one-time use.

## Failed 2FA Attempts

Invalid attempts return:

```json
{
  "error": {
    "code": "INVALID_TWO_FACTOR_CODE",
    "message": "Invalid authenticator code or recovery code.",
    "attemptsRemaining": 4
  }
}
```

Frontend behavior:

- Show the error inline.
- Update attempts remaining.
- Let the user retry while attempts remain.

After 5 bad attempts:

```json
{
  "error": {
    "code": "TWO_FACTOR_ATTEMPTS_EXHAUSTED",
    "message": "Too many invalid 2FA attempts. Start login again."
  }
}
```

Frontend behavior:

- Clear the challenge state.
- Send the user back to the login screen.

Expired challenge:

```json
{
  "error": {
    "code": "TWO_FACTOR_CHALLENGE_EXPIRED",
    "message": "2FA challenge was not found or has expired."
  }
}
```

Frontend behavior:

- Ask the user to log in again.

## Flow 3: Regenerate Recovery Codes

The user must be signed in and have 2FA enabled.

```http
POST /auth/2fa/recovery-codes/regenerate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "password": "student123",
  "code": "123456"
}
```

Example response:

```json
{
  "data": {
    "recoveryCodes": [
      "NEW12-ABCDE",
      "NEW34-FGHIJ"
    ],
    "recoveryCodeCount": 8
  }
}
```

Frontend behavior:

- Show the new codes once.
- Warn that old recovery codes no longer work.

## Flow 4: Disable 2FA

The user must be signed in.

```http
POST /auth/2fa/disable
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "password": "student123",
  "code": "123456"
}
```

The user can also use a recovery code:

```json
{
  "password": "student123",
  "recoveryCode": "A1B2C-D3E4F"
}
```

Success response:

```json
{
  "data": {
    "enabled": false,
    "recoveryCodeCount": 0
  }
}
```

Frontend behavior:

- Update the security settings screen.
- Clear any local “2FA enabled” UI state.
- Show a success state.

## Simple Fetch Helpers

```ts
const API_BASE_URL = "http://127.0.0.1:4200";

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const body = await response.json();

  if (!response.ok) {
    throw body.error || { code: "REQUEST_FAILED", message: "Request failed." };
  }

  return body.data;
}

export function startTwoFactorSetup(accessToken: string) {
  return api("/auth/2fa/setup", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function enableTwoFactor(accessToken: string, code: string) {
  return api("/auth/2fa/enable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ code })
  });
}

export function verifyTwoFactor(challengeId: string, code: string) {
  return api("/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code })
  });
}

export function verifyTwoFactorWithRecoveryCode(challengeId: string, recoveryCode: string) {
  return api("/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, recoveryCode })
  });
}

export function regenerateRecoveryCodes(accessToken: string, password: string, code: string) {
  return api("/auth/2fa/recovery-codes/regenerate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ password, code })
  });
}

export function disableTwoFactor(accessToken: string, password: string, code: string) {
  return api("/auth/2fa/disable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ password, code })
  });
}
```

## Frontend State Machine

Use this mental model:

```text
Logged out
  -> submit email/password
  -> if tokens returned: Logged in
  -> if requiresTwoFactor: Waiting for 2FA

Waiting for 2FA
  -> submit authenticator code
  -> if tokens returned: Logged in
  -> if invalid: stay on 2FA screen
  -> if attempts exhausted or expired: back to Login

Logged in
  -> start setup
  -> scan QR / enter code
  -> enabled
  -> show recovery codes
```

## UI Checklist For Students

- Show QR code from `otpauthUri`.
- Show manual secret as fallback.
- Show recovery codes once after enabling.
- During login, route `requiresTwoFactor` to a 2FA screen instead of treating it as an error.
- Store tokens only after `/auth/2fa/verify` succeeds.
- Show attempts remaining after invalid 2FA codes.
- Let the user switch from authenticator code to recovery code.
- Disable 2FA only after password plus code/recovery code confirmation.
