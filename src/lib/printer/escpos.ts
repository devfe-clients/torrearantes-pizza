/**
 * Gerador de comandos ESC/POS para impressora térmica 58mm (MPT-II).
 * 58mm = 32 caracteres por linha na fonte A (42 na fonte B / condensada).
 */
import type { Order } from "../types";
import { formatBRL, formatDateTime } from "../format";
import { PAYMENT_LABEL } from "../types";

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private chunks: number[] = [];
  constructor(private readonly width: number = 32) {
    this.raw([ESC, 0x40]); // init
    this.raw([ESC, 0x74, 0x00]); // PC437 (sem acentos, mas estável)
  }

  raw(bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }

  /** Latin-1 encode para acentos em português. */
  text(value: string) {
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      this.chunks.push(code < 256 ? code : 0x3f);
    }
    return this;
  }

  line(value = "") {
    return this.text(value).raw([0x0a]);
  }

  align(mode: "left" | "center" | "right") {
    return this.raw([ESC, 0x61, mode === "left" ? 0 : mode === "center" ? 1 : 2]);
  }

  bold(on: boolean) {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  size(w: 1 | 2, h: 1 | 2) {
    return this.raw([GS, 0x21, ((w - 1) << 4) | (h - 1)]);
  }

  divider(char = "-") {
    return this.line(char.repeat(this.width));
  }

  /** Linha com rótulo à esquerda e valor à direita. */
  row(left: string, right: string) {
    const space = Math.max(1, this.width - left.length - right.length);
    return this.line(`${left}${" ".repeat(space)}${right}`);
  }

  wrap(value: string, indent = 0) {
    const max = this.width - indent;
    const words = value.split(/\s+/);
    let current = "";
    for (const w of words) {
      if ((current + " " + w).trim().length > max) {
        this.line(" ".repeat(indent) + current.trim());
        current = w;
      } else {
        current = `${current} ${w}`;
      }
    }
    if (current.trim()) this.line(" ".repeat(indent) + current.trim());
    return this;
  }

  feedAndCut(lines = 4) {
    this.raw(new Array(lines).fill(0x0a));
    this.raw([GS, 0x56, 0x42, 0x00]); // corte parcial (ignorado se não houver guilhotina)
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

export type ReceiptOptions = {
  width?: 32 | 42 | undefined;
  shopName?: string | undefined;
  shopPhone?: string | undefined;
};

/** Monta a notinha do pedido pronta para a maquininha 58mm. */
export function buildOrderReceipt(order: Order, opts: ReceiptOptions = {}): Uint8Array {
  const width = opts.width ?? 32;
  const b = new EscPosBuilder(width);

  b.align("center").bold(true).size(2, 2);
  b.line((opts.shopName ?? "PIZZA TORRE ARANTES").toUpperCase());
  b.size(1, 1);
  b.line("DELIVERY");
  if (opts.shopPhone) b.line(opts.shopPhone);
  b.bold(false).divider("=");

  b.align("center").bold(true).size(2, 2).line(order.code).size(1, 1).bold(false);
  b.line(formatDateTime(order.createdAt));
  b.divider();

  b.align("left").bold(true).line("CLIENTE").bold(false);
  b.wrap(order.customerName);
  b.line(order.customerPhone);
  b.divider();

  b.bold(true).line("ENDERECO DE ENTREGA").bold(false);
  b.wrap(`${order.address.street}, ${order.address.number}`);
  if (order.address.complement) b.wrap(order.address.complement);
  b.wrap(order.address.district + (order.address.city ? ` - ${order.address.city}` : ""));
  if (order.address.reference) b.wrap(`Ref: ${order.address.reference}`);
  b.divider();

  b.bold(true).line("ITENS").bold(false);
  for (const item of order.items) {
    b.row(
      `${item.quantity}x ${truncate(item.name, width - 12)}`,
      formatBRL(item.unitPrice * item.quantity),
    );
    if (item.sizeName) b.line(`   Tam: ${item.sizeName}`);
    if (item.flavors?.length) b.wrap(`Sabores: ${item.flavors.join(" / ")}`, 3);
    for (const ex of item.extras ?? []) b.line(`   + ${truncate(ex.name, width - 5)}`);
    if (item.note) b.wrap(`Obs: ${item.note}`, 3);
  }
  b.divider();

  b.row("Subtotal", formatBRL(order.subtotal));
  if (order.discount > 0) b.row(`Desconto${order.couponCode ? ` ${order.couponCode}` : ""}`, `-${formatBRL(order.discount)}`);
  b.row("Entrega", formatBRL(order.deliveryFee));
  b.bold(true).size(1, 2).row("TOTAL", formatBRL(order.total)).size(1, 1).bold(false);
  b.divider();

  b.bold(true).line("PAGAMENTO").bold(false);
  b.line(PAYMENT_LABEL[order.paymentMethod]);
  b.line(order.status === "aguardando_pagamento" ? "STATUS: A RECEBER" : "STATUS: PAGO");
  if (order.paymentMethod === "dinheiro" && order.changeFor) {
    b.row("Troco para", formatBRL(order.changeFor));
    b.row("Levar troco", formatBRL(Math.max(0, order.changeFor - order.total)));
  }

  if (order.note) {
    b.divider();
    b.bold(true).line("OBSERVACOES").bold(false);
    b.wrap(order.note);
  }

  b.divider("=");
  b.align("center").line("Obrigado pela preferencia!");
  b.feedAndCut();
  return b.build();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}.` : value;
}
