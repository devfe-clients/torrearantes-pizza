/**
 * Integração Mercado Pago (estrutura pronta — só faltam as credenciais).
 *
 * CONFIGURAÇÃO (secrets do servidor):
 *   MERCADOPAGO_ACCESS_TOKEN   -> token privado da conta da pizzaria
 *   MERCADOPAGO_WEBHOOK_SECRET -> "Assinatura secreta" do painel de webhooks
 *   PUBLIC_SITE_URL            -> ex.: https://torrearantes.com.br
 *
 * O frontend NUNCA fala com o Mercado Pago diretamente: valor, itens e total
 * são calculados no servidor e o status só é atualizado pelo webhook assinado.
 */

const MP_API = "https://api.mercadopago.com";

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env["MERCADOPAGO_ACCESS_TOKEN"]);
}

function accessToken(): string {
  const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  return token;
}

function siteUrl(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "";
}

export type MpPreferenceItem = { title: string; quantity: number; unit_price: number };

/** Checkout Pro: cria a preferência e devolve o link de pagamento. */
export async function createPreference(params: {
  orderId: string;
  orderCode: string;
  items: MpPreferenceItem[];
  payer: { name: string; phone?: string };
  notificationUrl: string;
}): Promise<{ id: string; init_point: string }> {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken()}`,
      "content-type": "application/json",
      "x-idempotency-key": params.orderId,
    },
    body: JSON.stringify({
      external_reference: params.orderId,
      statement_descriptor: "TORREARANTES",
      items: params.items.map((i) => ({
        title: i.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
        currency_id: "BRL",
      })),
      payer: { name: params.payer.name },
      notification_url: params.notificationUrl,
      back_urls: {
        success: `${siteUrl()}/pedido/${params.orderId}`,
        pending: `${siteUrl()}/pedido/${params.orderId}`,
        failure: `${siteUrl()}/pedido/${params.orderId}`,
      },
      auto_return: "approved",
    }),
  });
  if (!res.ok) throw new Error(`Mercado Pago (preference): ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; init_point: string };
  return { id: data.id, init_point: data.init_point };
}

/** PIX direto: devolve o copia e cola + QR em base64. */
export async function createPixPayment(params: {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  notificationUrl: string;
}): Promise<{ id: string; qrCode: string; qrCodeBase64: string; expiresAt: string | null }> {
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken()}`,
      "content-type": "application/json",
      "x-idempotency-key": params.orderId,
    },
    body: JSON.stringify({
      transaction_amount: Number(params.amount.toFixed(2)),
      description: params.description,
      payment_method_id: "pix",
      external_reference: params.orderId,
      notification_url: params.notificationUrl,
      payer: { email: params.payerEmail, first_name: params.payerName },
    }),
  });
  if (!res.ok) throw new Error(`Mercado Pago (pix): ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    id: number;
    date_of_expiration?: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };
  const tx = data.point_of_interaction?.transaction_data;
  return {
    id: String(data.id),
    qrCode: tx?.qr_code ?? "",
    qrCodeBase64: tx?.qr_code_base64 ?? "",
    expiresAt: data.date_of_expiration ?? null,
  };
}

/** Consulta o pagamento na fonte (nunca confiar no corpo do webhook). */
export async function getPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
}> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago (payment): ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    id: String(data["id"]),
    status: String(data["status"]),
    status_detail: data["status_detail"] as string | undefined,
    external_reference: data["external_reference"] as string | undefined,
    transaction_amount: data["transaction_amount"] as number | undefined,
  };
}

/**
 * Valida a assinatura do webhook (header x-signature: ts=...,v1=...).
 * Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
export async function verifyWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): Promise<boolean> {
  const secret = process.env["MERCADOPAGO_WEBHOOK_SECRET"];
  if (!secret) return false;
  const { signatureHeader, requestId, dataId } = params;
  if (!signatureHeader || !dataId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // rejeita replays com mais de 5 minutos
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
