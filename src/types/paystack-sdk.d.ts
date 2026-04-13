declare module "@paystack/paystack-sdk" {
  export default class Paystack {
    constructor(secretKey: string);
    transaction: {
      initialize: (params: Record<string, unknown>) => Promise<{
        status?: boolean;
        message?: string;
        data?: Record<string, unknown>;
      }>;
      verify: (params: { reference: string }) => Promise<{
        status?: boolean;
        message?: string;
        data?: Record<string, unknown>;
      }>;
    };
  }
}
