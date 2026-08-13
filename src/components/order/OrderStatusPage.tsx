import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Bike, Package, XCircle, Copy, ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.jpg.asset.json";
import { subscribeOrder } from "@/lib/firestore";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatBRL, formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL, type Order, type OrderStatus } from "@/lib/types";

const STEPS: OrderStatus[] = ["aguardando_pagamento", "pago", "em_producao", "saiu_para_entrega", "entregue"];

const ICONS: Record<OrderStatus, typeof Clock> = {
  aguardando_pagamento: Clock,
  pago: CheckCircle2,
  em_producao: Package,
  saiu_para_entrega: Bike,
  entregue: CheckCircle2,
  cancelado: XCircle,
};

export function OrderStatusPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setError("Firebase não configurado.");
      return;
    }
    try {
      return subscribeOrder(orderId, setOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acompanhar o pedido.");
      return;
    }
  }, [orderId]);

  const currentIndex = order ? STEPS.indexOf(order.status) : -1;

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 py-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar ao cardápio
      </Link>

      <div className="panel space-y-6 rounded-3xl p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logoAsset.url} alt="Pizzaria Torre Arantes" className="h-20 w-auto" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!order && !error ? (
            <p className="text-sm text-muted-foreground">Carregando seu pedido...</p>
          ) : null}
          {order ? (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Pedido {order.code}
              </p>
              <h1 className="gold-text text-2xl">{ORDER_STATUS_LABEL[order.status]}</h1>
              <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
            </>
          ) : null}
        </div>

        {order ? (
          <>
            {order.status !== "cancelado" ? (
              <ol className="space-y-3">
                {STEPS.map((step, i) => {
                  const Icon = ICONS[step];
                  const done = i <= currentIndex;
                  return (
                    <li key={step} className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                          done
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className={done ? "text-foreground" : "text-muted-foreground"}>
                        {ORDER_STATUS_LABEL[step]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Este pedido foi cancelado.
              </p>
            )}

            <section className="space-y-2 border-t border-border pt-4 text-sm">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item.quantity}x {item.name}
                    {item.sizeName ? ` (${item.sizeName})` : ""}
                    {item.flavors?.length ? ` — ${item.flavors.join(" / ")}` : ""}
                  </span>
                  <span>{formatBRL(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted-foreground">
                <span>Entrega</span>
                <span>{formatBRL(order.deliveryFee)}</span>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Desconto</span>
                  <span>- {formatBRL(order.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="gold-text">{formatBRL(order.total)}</span>
              </div>
              <p className="pt-2 text-xs text-muted-foreground">
                Pagamento: {PAYMENT_LABEL[order.paymentMethod]}
              </p>
              <p className="text-xs text-muted-foreground">
                Entrega em {order.address.street}, {order.address.number} — {order.address.district}
              </p>
            </section>

            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(order.code)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-primary/40 py-2.5 text-xs font-semibold text-primary"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar código do pedido
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
