/**
 * payments-api.ts — online fee payment through Safepay Hosted Checkout.
 *
 * The browser never talks to Safepay's API and never decides that an invoice
 * is paid: the backend creates the checkout session and, on return, asks
 * Safepay for the outcome before recording the payment.
 */

import { auth } from "./firebase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to continue.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "The payment service is unavailable.");
  return body as T;
}

export const onlinePayments = {
  /** False when Safepay keys are not configured or the backend is unreachable. */
  async enabled(): Promise<boolean> {
    try {
      return (await call<{ safepay: boolean }>("/api/payments/config")).safepay === true;
    } catch {
      return false;
    }
  },

  /** Sends the browser to Safepay's checkout page for this invoice. */
  async payInvoice(invoiceId: string): Promise<void> {
    const { url } = await call<{ url: string }>("/api/payments/safepay/checkout", {
      method: "POST",
      body: JSON.stringify({ invoiceId }),
    });
    window.location.assign(url);
  },

  /** After returning from Safepay: the server verifies with Safepay and records it. */
  async confirm(tracker: string): Promise<"paid" | "unpaid" | "duplicate"> {
    const result = await call<{ status: "paid" | "unpaid" | "duplicate" }>("/api/payments/safepay/confirm", {
      method: "POST",
      body: JSON.stringify({ tracker }),
    });
    return result.status;
  },
};
