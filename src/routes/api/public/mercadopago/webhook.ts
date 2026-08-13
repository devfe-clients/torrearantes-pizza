/**
 * Webhook do Mercado Pago — única fonte de verdade do pagamento.
 *
 * Fluxo seguro:
 *  1. rate limit por IP;
 *  2. validação da assinatura HMAC (x-signature) com o secret do painel;
 *  3. consulta do pagamento direto na API (não confia no corpo recebido);
 *  4. atualização do pedido no Firestore com credencial de servidor.
 *
 * URL para cadastrar no painel:
 *   https://SEU-DOMINIO/api/public/mercadopago/webhook
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        try {
          enforceRateLimit(request, "mp-webhook", 60, 60 * 1000);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return new Response("Too Many Requests", {
              status: 429,
              headers: { "retry-after": String(error.retryAfter) },
            });
          }
          throw error;
        }

        const { getPayment, verifyWebhookSignature, isMercadoPagoConfigured } = await import(
          "@/lib/mercadopago.server"
        );
        if (!isMercadoPagoConfigured()) return new Response("Not configured", { status: 503 });

        const url = new URL(request.url);
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const dataId =
          url.searchParams.get("data.id") ??
          ((body["data"] as Record<string, unknown> | undefined)?.["id"] as string | undefined) ??
          null;

        const valid = await verifyWebhookSignature({
          signatureHeader: request.headers.get("x-signature"),
          requestId: request.headers.get("x-request-id"),
          dataId: dataId ? String(dataId) : null,
        });
        if (!valid) return new Response("Invalid signature", { status: 401 });

        const type = url.searchParams.get("type") ?? (body["type"] as string | undefined);
        if (type !== "payment" || !dataId) return new Response("ignored", { status: 200 });

        try {
          const payment = await getPayment(String(dataId));
          const orderId = payment.external_reference;
          if (!orderId) return new Response("no reference", { status: 200 });

          const { adminGetDoc, adminUpdateDoc } = await import("@/lib/firebase-admin.server");
          const order = await adminGetDoc(`orders/${orderId}`);
          if (!order) return new Response("order not found", { status: 200 });

          // confere o valor cobrado com o total do pedido
          const total = Number(order["total"] ?? 0);
          const paid = Number(payment.transaction_amount ?? 0);
          const amountOk = Math.abs(total - paid) < 0.01;

          if (payment.status === "approved" && amountOk) {
            if (order["status"] === "aguardando_pagamento") {
              await adminUpdateDoc(`orders/${orderId}`, {
                status: "pago",
                paymentStatus: payment.status,
                paymentId: payment.id,
                paidAt: Date.now(),
              });
            }
          } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
            await adminUpdateDoc(`orders/${orderId}`, {
              status: "cancelado",
              paymentStatus: payment.status,
              paymentId: payment.id,
            });
          } else {
            await adminUpdateDoc(`orders/${orderId}`, {
              paymentStatus: payment.status,
              paymentId: payment.id,
            });
          }
          return new Response("ok", { status: 200 });
        } catch (error) {
          console.error("[mp-webhook]", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
