/**
 * Rate limit simples (janela deslizante em memória) para proteger endpoints
 * públicos: criação de pedido, validação de cupom e webhook.
 *
 * Observação: a memória é por instância do worker. É uma primeira barreira
 * contra abuso/flood — não substitui as regras do Firestore nem a verificação
 * de assinatura do webhook.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

/** Identificador do chamador a partir dos headers da requisição. */
export function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `${scope}:${ip}`;
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Muitas tentativas. Tente novamente em ${retryAfter}s.`);
    this.name = "RateLimitError";
  }
}

export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const result = rateLimit(clientKey(request, scope), limit, windowMs);
  if (!result.allowed) throw new RateLimitError(result.retryAfter);
  return result;
}
