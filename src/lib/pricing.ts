import type { Product, ProductSize } from "./types";

/** Preço válido considerando promoção (só vale se for menor que o preço normal). */
export function effectivePrice(price: number, promo?: number | null): number {
  if (typeof promo === "number" && promo > 0 && promo < price) return promo;
  return price;
}

export function productBasePrice(product: Product): number {
  return effectivePrice(product.price ?? 0, product.promoPrice);
}

export function sizePrice(size: ProductSize): number {
  return effectivePrice(size.price, size.promoPrice);
}

/** Menor preço exibido na vitrine (considera tamanhos e promoções). */
export function productFromPrice(product: Product): number {
  if (product.sizes?.length) return Math.min(...product.sizes.map(sizePrice));
  return productBasePrice(product);
}

/** Preço "de" (riscado) quando há promoção, senão null. */
export function productListPrice(product: Product): number | null {
  if (product.sizes?.length) {
    const cheapest = product.sizes.reduce((a, b) => (sizePrice(a) <= sizePrice(b) ? a : b));
    return sizePrice(cheapest) < cheapest.price ? cheapest.price : null;
  }
  return productBasePrice(product) < (product.price ?? 0) ? product.price : null;
}

export function hasPromo(product: Product): boolean {
  return productListPrice(product) !== null;
}
