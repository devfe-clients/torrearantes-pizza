import { useState } from "react";
import {
  Minus,
  Plus,
  Trash2,
  X,
  Bike,
  Ticket,
  Loader2,
  ShieldCheck,
  QrCode,
  CreditCard,
  Banknote,
} from "lucide-react";
import { formatBRL, formatPhone, onlyDigits } from "@/lib/format";
import { cartSubtotal, type CartLine } from "@/lib/cart";
import type { PaymentMethod, ShopSettings } from "@/lib/types";
import { createOrderFn, validateCouponFn } from "@/lib/checkout.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  settings: ShopSettings | null;
  onChangeQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onOrderCreated: (result: { orderId: string; checkoutUrl?: string | null | undefined }) => void;
  onClear: () => void;
};

type Step = "cart" | "dados" | "pagamento";

export function CartDrawer(props: Props) {
  const { open, onClose, lines, settings, onChangeQty, onRemove, onOrderCreated, onClear } = props;
  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponState, setCouponState] = useState<{ discount: number; message: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = cartSubtotal(lines);
  const zone = settings?.deliveryZones?.find(
    (z) => z.district.trim().toLowerCase() === district.trim().toLowerCase(),
  );
  const deliveryFee = zone?.fee ?? settings?.defaultDeliveryFee ?? 0;
  const discount = couponState?.discount ?? 0;
  const total = Math.max(0, subtotal - discount) + deliveryFee;
  const minOk = !settings?.minOrderValue || subtotal >= settings.minOrderValue;

  async function applyCoupon() {
    if (!coupon.trim()) return;
    setCouponBusy(true);
    try {
      const res = await validateCouponFn({ data: { code: coupon.trim(), subtotal } });
      setCouponState({ discount: res.valid ? res.discount : 0, message: res.message });
    } catch {
      setCouponState({ discount: 0, message: "Não foi possível validar o cupom." });
    } finally {
      setCouponBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setSending(true);
    try {
      const res = await createOrderFn({
        data: {
          customerName: name.trim(),
          customerPhone: onlyDigits(phone),
          address: {
            street: street.trim(),
            number: number.trim(),
            complement: complement.trim() || undefined,
            district: district.trim(),
            reference: reference.trim() || undefined,
          },
          items: lines.map((l) => ({
            productId: l.productId,
            sizeId: l.sizeId,
            flavorIds: l.flavorIds,
            extraIds: l.extraIds,
            note: l.note,
            quantity: l.quantity,
          })),
          paymentMethod: payment,
          changeFor: payment === "dinheiro" && changeFor ? Number(changeFor) : null,
          couponCode: couponState?.discount ? coupon.trim() : undefined,
          note: note.trim() || undefined,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClear();
      onOrderCreated({ orderId: res.orderId, checkoutUrl: res.checkoutUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar o pedido.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const canGoData = lines.length > 0 && minOk;
  const canSubmit =
    name.trim().length >= 2 &&
    onlyDigits(phone).length >= 10 &&
    street.trim().length >= 3 &&
    number.trim().length >= 1 &&
    district.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
      <aside className="panel flex h-full w-full max-w-md flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Seu pedido</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bike className="h-3.5 w-3.5" /> Somente delivery
              {settings?.estimatedTime ? ` · ${settings.estimatedTime}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar carrinho">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Seu carrinho está vazio.
            </p>
          ) : (
            lines.map((line) => (
              <div key={line.key} className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {line.name}
                      {line.sizeName ? ` · ${line.sizeName}` : ""}
                    </p>
                    {line.flavorNames.length ? (
                      <p className="text-xs text-muted-foreground">
                        Sabores: {line.flavorNames.join(" / ")}
                      </p>
                    ) : null}
                    {line.extraNames.filter(Boolean).length ? (
                      <p className="text-xs text-muted-foreground">
                        Adicionais: {line.extraNames.filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="text-xs text-muted-foreground">Obs.: {line.note}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label="Remover item"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 rounded-full border border-border px-3 py-1.5">
                    <button
                      type="button"
                      aria-label="Diminuir"
                      onClick={() => onChangeQty(line.key, -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Aumentar"
                      onClick={() => onChangeQty(line.key, 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatBRL(line.unitPrice * line.quantity)}
                  </span>
                </div>
              </div>
            ))
          )}

          {step !== "cart" && lines.length > 0 ? (
            <section className="space-y-3 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">
                Entrega
              </h3>
              <Field label="Nome" value={name} onChange={setName} maxLength={80} />
              <Field
                label="WhatsApp"
                value={phone}
                onChange={(v) => setPhone(formatPhone(v))}
                maxLength={16}
                inputMode="tel"
              />
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <Field label="Rua" value={street} onChange={setStreet} maxLength={120} />
                <Field label="Nº" value={number} onChange={setNumber} maxLength={12} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bairro" value={district} onChange={setDistrict} maxLength={80} />
                <Field
                  label="Complemento"
                  value={complement}
                  onChange={setComplement}
                  maxLength={80}
                />
              </div>
              <Field
                label="Ponto de referência"
                value={reference}
                onChange={setReference}
                maxLength={120}
              />
              <Field label="Observações do pedido" value={note} onChange={setNote} maxLength={300} />

              <h3 className="pt-2 text-xs font-semibold uppercase tracking-widest text-primary">
                Pagamento
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "pix", label: "PIX", icon: QrCode },
                    { id: "cartao", label: "Cartão", icon: CreditCard },
                    { id: "dinheiro", label: "Dinheiro", icon: Banknote },
                  ] as const
                )
                  .filter((m) => settings?.payments?.[m.id] !== false)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayment(m.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition ${
                        payment === m.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/40"
                      }`}
                    >
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
              </div>
              {payment === "dinheiro" ? (
                <Field
                  label="Troco para quanto?"
                  value={changeFor}
                  onChange={(v) => setChangeFor(v.replace(/[^\d.]/g, ""))}
                  maxLength={7}
                  inputMode="decimal"
                />
              ) : null}

              <div className="flex items-end gap-2">
                <Field
                  label="Cupom de desconto"
                  value={coupon}
                  onChange={(v) => setCoupon(v.toUpperCase())}
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponBusy}
                  className="mb-0.5 flex items-center gap-1 rounded-xl border border-primary/40 px-3 py-2.5 text-xs font-semibold text-primary"
                >
                  {couponBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ticket className="h-3.5 w-3.5" />
                  )}
                  Aplicar
                </button>
              </div>
              {couponState ? (
                <p
                  className={`text-xs ${couponState.discount > 0 ? "text-success" : "text-destructive"}`}
                >
                  {couponState.message}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="space-y-3 border-t border-border px-5 py-4">
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatBRL(subtotal)} />
            {discount > 0 ? <Row label="Desconto" value={`- ${formatBRL(discount)}`} /> : null}
            <Row label="Taxa de entrega" value={formatBRL(deliveryFee)} />
            <div className="flex items-center justify-between pt-1 text-base font-semibold">
              <span>Total</span>
              <span className="gold-text">{formatBRL(total)}</span>
            </div>
          </div>

          {!minOk ? (
            <p className="text-xs text-destructive">
              Pedido mínimo de {formatBRL(settings?.minOrderValue ?? 0)} para entrega.
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {step === "cart" ? (
            <button
              type="button"
              disabled={!canGoData}
              onClick={() => setStep("dados")}
              className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit || sending}
              onClick={submit}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {payment === "dinheiro" ? "Enviar pedido" : "Ir para o pagamento"}
            </button>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Valores conferidos no servidor antes da cobrança
          </p>
        </footer>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  inputMode?: "tel" | "decimal";
}) {
  return (
    <label className="block w-full text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
