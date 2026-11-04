declare module "#auth-utils" {
  interface User {
    signedIn?: boolean;
    /** Older sealed cookies; removed from every public session response. */
    sessionId?: string;
    accountId?: string;
  }
  interface SecureSessionData {
    sessionId: string;
    accountId: string;
  }
}

export {};
