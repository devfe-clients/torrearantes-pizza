import type { Product } from "./types";
import { effectivePrice, productBasePrice, sizePrice } from "./pricing";

export type CartLine = {
  /** id único da linha (produto + variações) */
  key: string;
  productId: string;
  name: string;
  image?: string | undefined;
  sizeId?: string | undefined;
  sizeName?: string | undefined;
  flavorIds: string[];
  flavorNames: string[];
  extraIds: string[];
  extraNames: string[];
  note?: string | undefined;
  /** preço unitário estimado — o valor oficial é recalculado no servidor */
  unitPrice: number;
  quantity: number;
};

const STORAGE_KEY = "torre-arantes:cart";

export function lineKey(line: Omit<CartLine, "key" | "quantity">): string {
  return [
    line.productId,
    line.sizeId ?? "",
    line.flavorIds.join("|"),
    line.extraIds.join("|"),
    line.note ?? "",
  ].join("::");
}

export function cartSubtotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function loadCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* ignora quota */
  }
}

/** Preço unitário estimado no cliente (o servidor recalcula tudo). */
export function estimatePrice(
  product: Product,
  sizeId: string | undefined,
  flavors: Product[],
  extraIds: string[],
): number {
  let price = productBasePrice(product);
  const size = product.sizes?.find((s) => s.id === sizeId);
  if (size) price = sizePrice(size);
  for (const flavor of flavors) {
    const flavorSize = size ? flavor.sizes?.find((s) => s.name === size.name) : undefined;
    const flavorPrice = flavorSize
      ? sizePrice(flavorSize)
      : effectivePrice(flavor.price, flavor.promoPrice);
    price = Math.max(price, flavorPrice);
  }
  for (const id of extraIds) {
    const extra = product.extras?.find((e) => e.id === id);
    if (extra) price += extra.price;
  }
  return Math.round(price * 100) / 100;
}
