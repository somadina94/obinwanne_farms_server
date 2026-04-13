import Paystack from "@paystack/paystack-sdk";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

export function getPaystackClient(): Paystack {
  return new Paystack(getSecretKey());
}

export interface InitializePayload {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export async function initializeTransaction(payload: InitializePayload) {
  const paystack = getPaystackClient();
  const meta =
    payload.metadata !== undefined
      ? JSON.stringify(payload.metadata)
      : undefined;
  const body: Record<string, unknown> = {
    email: payload.email,
    amount: payload.amountKobo,
    reference: payload.reference,
    currency: "NGN",
    metadata: meta,
  };
  if (payload.callbackUrl !== undefined) {
    body.callback_url = payload.callbackUrl;
  }
  const res = await paystack.transaction.initialize(body);
  return res;
}

export async function verifyTransaction(reference: string) {
  const paystack = getPaystackClient();
  const res = await paystack.transaction.verify({ reference });
  return res;
}
