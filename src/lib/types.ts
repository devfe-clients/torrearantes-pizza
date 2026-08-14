/**
 * Modelo de dados do cardápio digital — Pizzaria Torre Arantes.
 * Somente DELIVERY (não existe retirada no local).
 */

export type Product = {
  id: string;
  name: string;
  description?: string;
  /** preço base (usado quando o produto não tem tamanhos) */
  price: number;
  /** preço promocional (menor que o preço normal). null/0 = sem promoção */
  promoPrice?: number | null;
  category: string;
  subcategory?: string | null;
  image?: string;
  available: boolean;
  featured?: boolean;
  order?: number;
  createdAt?: number;
  /** null = estoque ilimitado */
  stock?: number | null;
  /** tamanhos (broto/média/grande) com preço próprio */
  sizes?: ProductSize[] | null;
  /** máximo de sabores permitidos (pizza meio a meio) */
  maxFlavors?: number | null;
  /** adicionais opcionais (borda recheada, etc.) */
  extras?: ProductExtra[] | null;
  /** obriga observação do cliente */
  requiresNote?: boolean | null;
  notePlaceholder?: string | null;
  prepMinutes?: number | null;
};

export type ProductSize = { id: string; name: string; price: number; slices?: number | null };
export type ProductExtra = { id: string; name: string; price: number };

export type Category = { name: string; order: number };

export type OrderStatus =
  | "aguardando_pagamento"
  | "pago"
  | "em_producao"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pagamento confirmado",
  em_producao: "Em produção",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export type PaymentMethod = "pix" | "cartao" | "dinheiro";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  cartao: "Cartão",
  dinheiro: "Dinheiro na entrega",
};

export type OrderItem = {
  productId: string;
  name: string;
  sizeName?: string | null;
  flavors?: string[] | null;
  extras?: { name: string; price: number }[] | null;
  note?: string | null;
  unitPrice: number;
  quantity: number;
};

export type OrderAddress = {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city?: string;
  reference?: string;
  zip?: string;
};

export type Order = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  note?: string;
  address: OrderAddress;
  paymentMethod: PaymentMethod;
  /** troco para quanto (pagamento em dinheiro) */
  changeFor?: number | null;
  couponCode?: string | null;
  createdAt: number;
  paidAt?: number | null;
  /** controle de impressão automática na maquininha 58mm */
  printed?: boolean;
  printedAt?: number | null;
  /** integração Mercado Pago */
  paymentId?: string | null;
  paymentStatus?: string | null;
  preferenceId?: string | null;
};

export type Coupon = {
  id: string;
  code: string;
  type: "fixed" | "percent";
  value: number;
  active: boolean;
  minOrderValue?: number | null;
  /** limite total de usos (null = ilimitado) */
  maxUses?: number | null;
  uses?: number;
  /** válido apenas na primeira compra do cliente */
  firstOrderOnly?: boolean;
  expiresAt?: number | null;
};

export type DeliveryZone = { id: string; district: string; fee: number; minutes?: number | null };

export type ShopSettings = {
  name: string;
  tagline?: string;
  whatsapp: string;
  logo?: string;
  storeClosed?: boolean;
  storeReopenAt?: string;
  /** horários por dia da semana, 0=domingo */
  openingHours?: { day: number; open: string; close: string; closed?: boolean }[];
  minOrderValue?: number;
  defaultDeliveryFee?: number;
  deliveryZones?: DeliveryZone[];
  estimatedTime?: string;
  payments?: { pix?: boolean; cartao?: boolean; dinheiro?: boolean };
  /** impressão automática após pagamento confirmado */
  autoPrint?: boolean;
  printerWidth?: 32 | 42;
  printCopies?: number;
};

export const DEFAULT_CATEGORIES = [
  "Pizzas Salgadas",
  "Pizzas Doces",
  "Bordas & Adicionais",
  "Esfihas",
  "Bebidas",
  "Sobremesas",
];
