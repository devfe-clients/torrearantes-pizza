import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const couponSchema = z.object({
  code: z.string().trim().min(1).max(30),
  subtotal: z.number().min(0).max(100000),
});

const checkoutInputSchema = z.unknown();

export const createOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkoutInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { enforceRateLimit, RateLimitError } = await import("./rate-limit.server");
    const { checkoutSchema, processCheckout } = await import("./checkout.server");
    const request = getRequest();
    try {
      // no máximo 5 pedidos por IP a cada 5 minutos
      enforceRateLimit(request, "checkout", 5, 5 * 60 * 1000);
      const parsed = checkoutSchema.parse(data);
      const origin = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;
      const result = await processCheckout(parsed, origin);
      return { ok: true as const, ...result };
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { ok: false as const, error: error.message };
      }
      if (error instanceof z.ZodError) {
        return { ok: false as const, error: "Dados do pedido inválidos. Revise o formulário." };
      }
      console.error("[checkout]", error);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível enviar o pedido.",
      };
    }
  });

export const validateCouponFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => couponSchema.parse(data))
  .handler(async ({ data }) => {
    const { enforceRateLimit, RateLimitError } = await import("./rate-limit.server");
    const { previewCoupon } = await import("./checkout.server");
    try {
      // 10 tentativas por IP a cada 5 minutos (evita força bruta de cupons)
      enforceRateLimit(getRequest(), "coupon", 10, 5 * 60 * 1000);
      return await previewCoupon(data.code, data.subtotal);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { valid: false as const, discount: 0, message: error.message };
      }
      console.error("[coupon]", error);
      return { valid: false as const, discount: 0, message: "Não foi possível validar o cupom." };
    }
  });
