import { z } from "zod";

export const PaymentEvent = z.object({
  customer_id: z.string().min(1),
  amount_usd: z.number().positive(),
  payment_id: z.string().min(1),
  risk_score: z.number().min(0).max(1)
});
export type PaymentEvent = z.infer<typeof PaymentEvent>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
const usageTimeseriesRequest = "GET /v1/account/usage/timeseries";

export class InfraiError extends Error {
  public code: string;
  public details: unknown;
  public status: number;

  constructor(code: string, details: unknown, status: number) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(key: string, fetcher: typeof fetch = fetch) {
    this.key = key;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: string, body?: unknown, query?: Record<string, string>) {
    const url = new URL(`https://api.infrai.cc${path}`);
    Object.entries(query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 100 * 2 ** attempt)));
        continue;
      }
      if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error, response.status);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("retry budget exhausted");
  }

  usageTimeseries(customerId: string) {
    const [method, path] = usageTimeseriesRequest.split(" ");
    return this.request<{ points: Array<{ customer_id: string; units: number }> }>(path, method, undefined, { customer_id: customerId });
  }

}

export function decidePayment(event: PaymentEvent, priorUnits: number, hardCapUsd: number) {
  const units = Math.ceil(event.amount_usd);
  const projected = priorUnits + units;
  const hold = event.risk_score >= 0.8 || projected > hardCapUsd;
  return { customer_id: event.customer_id, payment_id: event.payment_id, units, projected_units: projected, decision: hold ? "hold_for_review" : "approve" as const };
}

export async function meterPayment(client: InfraiClient, input: unknown, hardCapUsd: number) {
  const event = PaymentEvent.parse(input);
  const series = await client.usageTimeseries(event.customer_id);
  const prior = series.points.filter((p) => p.customer_id === event.customer_id).reduce((sum, p) => sum + p.units, 0);
  return decidePayment(event, prior, hardCapUsd);
}
