import { z } from "zod";
import {
  adminCreateDoc,
  adminGetDoc,
  adminQuery,
  adminUpdateDoc,
} from "./firebase-admin.server";
import { createPixPayment, createPreference, isMercadoPagoConfigured } from "./mercadopago.server";
import { generateOrderCode } from "./format";
import type { Coupon, OrderItem, Product, ShopSettings } from "./types";
import { effectivePrice, productBasePrice, sizePrice } from "./pricing";

export const checkoutSchema = z.object({
  userId: z.string().trim().max(128).optional(),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().regex(/^\d{10,11}$/, "Telefone inválido"),
  address: z.object({
    street: z.string().trim().min(3).max(120),
    number: z.string().trim().min(1).max(12),
    complement: z.string().trim().max(80).optional(),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().max(80).optional(),
    reference: z.string().trim().max(120).optional(),
    zip: z.string().trim().max(9).optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        sizeId: z.string().trim().max(64).optional(),
        flavorIds: z.array(z.string().trim().min(1).max(64)).max(4).optional(),
        extraIds: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
        note: z.string().trim().max(200).optional(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  paymentMethod: z.enum(["pix", "cartao", "dinheiro"]),
  changeFor: z.number().min(0).max(1000).nullable().optional(),
  couponCode: z.string().trim().max(30).optional(),
  note: z.string().trim().max(300).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutResult = {
  orderId: string;
  orderCode: string;
  total: number;
  paymentPending: boolean;
  checkoutUrl?: string | null;
  pix?: { qrCode: string; qrCodeBase64: string; expiresAt: string | null } | null;
  warning?: string | null;
};

async function loadProduct(id: string): Promise<Product> {
  const data = await adminGetDoc(`products/${id}`);
  if (!data) throw new Error("Produto indisponível no cardápio.");
  const product = { id, ...(data as unknown as Omit<Product, "id">) };
  if (!product.available) throw new Error(`"${product.name}" está indisponível.`);
  return product;
}

/** Recalcula os itens a partir do cardápio real. */
async function buildItems(input: CheckoutInput): Promise<{ items: OrderItem[]; subtotal: number }> {
  const items: OrderItem[] = [];
  let subtotal = 0;

  for (const line of input.items) {
    const product = await loadProduct(line.productId);

    let unitPrice = productBasePrice(product);
    let sizeName: string | null = null;
    if (product.sizes?.length) {
      const size = product.sizes.find((s) => s.id === line.sizeId) ?? product.sizes[0]!;
      unitPrice = sizePrice(size);
      sizeName = size.name;
    }

    // pizza meio a meio: cobra o sabor mais caro
    const flavors: string[] = [];
    if (line.flavorIds?.length) {
      const max = product.maxFlavors ?? 1;
      const ids = line.flavorIds.slice(0, Math.max(1, max));
      for (const flavorId of ids) {
        const flavor = await loadProduct(flavorId);
        flavors.push(flavor.name);
        const flavorSize = flavor.sizes?.length
          ? flavor.sizes.find((s) => s.name === sizeName)
          : undefined;
        const flavorPrice = flavorSize
          ? sizePrice(flavorSize)
          : effectivePrice(flavor.price, flavor.promoPrice);
        unitPrice = Math.max(unitPrice, flavorPrice);
      }
    }

    const extras: { name: string; price: number }[] = [];
    for (const extraId of line.extraIds ?? []) {
      const extra = product.extras?.find((e) => e.id === extraId);
      if (!extra) continue;
      extras.push({ name: extra.name, price: extra.price });
      unitPrice += extra.price;
    }

    if (product.requiresNote && !line.note) {
      throw new Error(`Informe a observação obrigatória de "${product.name}".`);
    }

    unitPrice = Math.round(unitPrice * 100) / 100;
    subtotal += unitPrice * line.quantity;

    items.push({
      productId: product.id,
      name: product.name,
      sizeName,
      flavors: flavors.length ? flavors : null,
      extras: extras.length ? extras : null,
      note: line.note ?? null,
      unitPrice,
      quantity: line.quantity,
    });
  }

  return { items, subtotal: Math.round(subtotal * 100) / 100 };
}

function resolveDeliveryFee(settings: ShopSettings | null, district: string): number {
  const zone = settings?.deliveryZones?.find(
    (z) => z.district.trim().toLowerCase() === district.trim().toLowerCase(),
  );
  return Math.round(((zone?.fee ?? settings?.defaultDeliveryFee ?? 0) as number) * 100) / 100;
}

async function resolveCoupon(
  code: string | undefined,
  subtotal: number,
): Promise<{ coupon: Coupon | null; discount: number }> {
  if (!code) return { coupon: null, discount: 0 };
  const rows = await adminQuery("coupons", "code", code.trim().toUpperCase(), 1);
  const row = rows[0];
  if (!row) return { coupon: null, discount: 0 };
  const coupon = { id: row.id, ...(row.data as unknown as Omit<Coupon, "id">) };

  if (!coupon.active) return { coupon: null, discount: 0 };
  if (coupon.expiresAt && coupon.expiresAt < Date.now()) return { coupon: null, discount: 0 };
  if (coupon.maxUses != null && (coupon.uses ?? 0) >= coupon.maxUses)
    return { coupon: null, discount: 0 };
  if (coupon.minOrderValue != null && subtotal < coupon.minOrderValue)
    return { coupon: null, discount: 0 };

  const raw = coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value;
  const discount = Math.min(subtotal, Math.round(raw * 100) / 100);
  return { coupon, discount };
}

export async function processCheckout(
  input: CheckoutInput,
  origin: string,
): Promise<CheckoutResult> {
  const settings = (await adminGetDoc("settings/shop")) as unknown as ShopSettings | null;
  if (settings?.storeClosed) throw new Error("A pizzaria está fechada no momento.");

  const { items, subtotal } = await buildItems(input);

  if (settings?.minOrderValue && subtotal < settings.minOrderValue) {
    throw new Error(`O pedido mínimo para entrega é de R$ ${settings.minOrderValue.toFixed(2)}.`);
  }

  const deliveryFee = resolveDeliveryFee(settings, input.address.district);
  const { coupon, discount } = await resolveCoupon(input.couponCode, subtotal);
  const total = Math.round((subtotal - discount + deliveryFee) * 100) / 100;

  if (input.paymentMethod === "dinheiro" && input.changeFor && input.changeFor < total) {
    throw new Error("O valor do troco precisa ser maior que o total do pedido.");
  }

  const orderId = crypto.randomUUID();
  const orderCode = generateOrderCode();
  const now = Date.now();
  const online = input.paymentMethod !== "dinheiro";
  const mpReady = isMercadoPagoConfigured();

  const order = {
    code: orderCode,
    userId: input.userId ?? null,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: items as unknown as Record<string, unknown>[],
    subtotal,
    deliveryFee,
    discount,
    total,
    // dinheiro na entrega já entra na produção; online só após o webhook
    status: online && mpReady ? "aguardando_pagamento" : "em_producao",
    note: input.note ?? "",
    address: input.address as unknown as Record<string, unknown>,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    couponCode: coupon?.code ?? null,
    createdAt: now,
    paidAt: null,
    printed: false,
    printedAt: null,
    paymentId: null,
    paymentStatus: online && mpReady ? "pending" : "on_delivery",
    preferenceId: null,
  };

  await adminCreateDoc("orders", orderId, order);
  if (coupon) {
    await adminUpdateDoc(`coupons/${coupon.id}`, { uses: (coupon.uses ?? 0) + 1 });
  }

  const result: CheckoutResult = {
    orderId,
    orderCode,
    total,
    paymentPending: online && mpReady,
    checkoutUrl: null,
    pix: null,
    warning: null,
  };

  if (!online) return result;
  if (!mpReady) {
    result.warning =
      "Pagamento online ainda não está configurado. O pedido foi enviado e o pagamento será combinado na entrega.";
    return result;
  }

  const notificationUrl = `${origin}/api/public/mercadopago/webhook`;

  if (input.paymentMethod === "pix") {
    const pix = await createPixPayment({
      orderId,
      amount: total,
      description: `Pedido ${orderCode} — Pizzaria Torre Arantes`,
      payerEmail: `pedido-${orderCode.toLowerCase()}@torrearantes.com.br`,
      payerName: input.customerName,
      notificationUrl,
    });
    await adminUpdateDoc(`orders/${orderId}`, { paymentId: pix.id });
    result.pix = { qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64, expiresAt: pix.expiresAt };
    return result;
  }

  const preference = await createPreference({
    orderId,
    orderCode,
    items: [{ title: `Pedido ${orderCode}`, quantity: 1, unit_price: total }],
    payer: { name: input.customerName },
    notificationUrl,
  });
  await adminUpdateDoc(`orders/${orderId}`, { preferenceId: preference.id });
  result.checkoutUrl = preference.init_point;
  return result;
}

/** Validação de cupom sem criar pedido (usada na tela do carrinho). */
export async function previewCoupon(code: string, subtotal: number) {
  const { coupon, discount } = await resolveCoupon(code, subtotal);
  if (!coupon) return { valid: false as const, discount: 0, message: "Cupom inválido ou expirado." };
  return { valid: true as const, discount, code: coupon.code, message: "Cupom aplicado." };
}
