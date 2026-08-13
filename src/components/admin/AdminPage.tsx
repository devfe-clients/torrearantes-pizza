import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Printer,
  Bluetooth,
  BluetoothConnected,
  LogOut,
  ShoppingBag,
  Package,
  SettingsIcon,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import {
  compressImage,
  createProduct,
  deleteOrder,
  deleteProduct,
  ensureCategoriesSeed,
  saveShopSettings,
  setOrderStatus,
  subscribeOrders,
  subscribeProducts,
  subscribeShopSettings,
  updateProduct,
} from "@/lib/firestore";
import { formatBRL, formatTime, parsePrice } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_LABEL,
  type Order,
  type OrderStatus,
  type Product,
  type ShopSettings,
} from "@/lib/types";
import { usePrinter, useAutoPrint } from "@/lib/printer/usePrinter";
import { useNewOrderBell } from "@/lib/useNewOrder";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { Bell, BellOff, Tag, Percent } from "lucide-react";
import { subscribeCoupons, saveCoupon, deleteCoupon } from "@/lib/firestore";
import type { Coupon } from "@/lib/types";
type Tab = "pedidos" | "produtos" | "cupons" | "ajustes";
export function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("pedidos");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const printer = usePrinter(settings);
useAutoPrint(orders, printer, settings?.autoPrint !== false);
  useNewOrderBell(orders);
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true);
      return;
    }
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setReady(true);
      const adminEmail = import.meta.env["VITE_ADMIN_EMAIL"];
if (!user || (adminEmail && user.email !== adminEmail)) {
  void navigate({ to: "/auth" });
}
    });
  }, [navigate]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const u1 = subscribeOrders(setOrders);
    const u2 = subscribeProducts(setProducts);
    const u3 = subscribeShopSettings(setSettings);
    const u4 = subscribeCoupons(setCoupons);
    void ensureCategoriesSeed().catch(() => undefined);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  useEffect(() => {
    if (!isPushSupported()) return;
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub))
    );
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const ok = await subscribeToPush();
        setPushEnabled(ok);
      }
    } finally {
      setPushBusy(false);
    }
  }

  const pending = useMemo(
    () => orders.filter((o) => !["entregue", "cancelado"].includes(o.status)),
    [orders],
  );

  if (!ready) return <div className="min-h-screen" />;
  if (!isFirebaseConfigured()) {
    return (
      <div className="mx-auto max-w-md p-8 text-sm text-muted-foreground">
        Configure as variáveis VITE_FIREBASE_* para usar o painel.
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <header className="border-b border-border px-5 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <h1 className="gold-text text-lg">Painel · Torre Arantes</h1>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => (printer.connected ? printer.disconnect() : void printer.connect())}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition active:scale-95 ${
                printer.connected ? "border-success text-success" : "border-primary/40 text-primary"
              }`}
            >
              {printer.connected ? (
                <BluetoothConnected className="h-3.5 w-3.5" />
              ) : (
                <Bluetooth className="h-3.5 w-3.5" />
              )}
              {printer.connected ? (printer.name ?? "Impressora") : "Conectar impressora"}
            </button>
           {isPushSupported() ? (
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void togglePush()}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition active:scale-95 ${
                  pushEnabled ? "border-success text-success" : "border-border text-muted-foreground"
                }`}
              >
                {pushEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                {pushEnabled ? "Notificações ativas" : "Ativar notificações"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut(getFirebase().auth)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 transition active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
        {printer.error ? (
          <p className="mx-auto max-w-5xl pt-2 text-xs text-destructive">{printer.error}</p>
        ) : null}
      </header>

      <nav className="mx-auto flex max-w-5xl gap-2 px-5 py-4">
        {(
          [
            { id: "pedidos", label: `Pedidos (${pending.length})`, icon: ShoppingBag },
            { id: "produtos", label: "Cardápio", icon: Package },
            { id: "cupons", label: "Cupons", icon: Tag },
            { id: "ajustes", label: "Ajustes", icon: SettingsIcon },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium ${
              tab === t.id ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl space-y-4 px-5">
        {tab === "pedidos" ? <OrdersTab orders={orders} printer={printer} /> : null}
        {tab === "produtos" ? <ProductsTab products={products} /> : null}
        {tab === "cupons" ? <CouponsTab coupons={coupons} /> : null}
        {tab === "ajustes" ? <SettingsTab settings={settings} /> : null}
      </main>
    </div>
  );
}

function OrdersTab({
  orders,
  printer,
}: {
  orders: Order[];
  printer: ReturnType<typeof usePrinter>;
}) {
  const statuses: OrderStatus[] = ["pago", "em_producao", "saiu_para_entrega", "entregue", "cancelado"];
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>
      ) : null}
      {orders.map((order) => (
        <article key={order.id} className="panel space-y-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {order.code} · {order.customerName}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(order.createdAt)} · {PAYMENT_LABEL[order.paymentMethod]} ·{" "}
                {ORDER_STATUS_LABEL[order.status]}
                {order.printed ? " · impresso" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="gold-text text-lg font-semibold">{formatBRL(order.total)}</span>
              <button
                type="button"
                onClick={() => void printer.printOrder(order).catch(() => undefined)}
                className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary transition active:scale-95"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground">
            {order.items.map((item, i) => (
              <li key={i}>
                {item.quantity}x {item.name}
                {item.sizeName ? ` (${item.sizeName})` : ""}
                {item.flavors?.length ? ` — ${item.flavors.join(" / ")}` : ""}
                {item.note ? ` · obs: ${item.note}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {order.address.street}, {order.address.number} — {order.address.district}
            {order.address.complement ? ` (${order.address.complement})` : ""} ·{" "}
            {order.customerPhone}
          </p>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setOrderStatus(order.id, s)}
                className={`rounded-full border px-3 py-1 text-[11px] transition active:scale-95 ${
                  order.status === s ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {ORDER_STATUS_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void deleteOrder(order.id)}
              className="rounded-full border border-destructive/40 px-3 py-1 text-[11px] text-destructive transition active:scale-95"
            >
              <Trash2 className="inline h-3 w-3" /> Excluir
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProductsTab({ products }: { products: Product[] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pizzas Salgadas");
  const [price, setPrice] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function handleImageSelect(file: File, productId?: string) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = e.target?.result as string;
      const compressed = await compressImage(raw);
      if (productId) {
        setUploadingId(productId);
        await updateProduct(productId, { image: compressed }).catch(() => undefined);
        setUploadingId(null);
      } else {
        setImagePreview(compressed);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-2 rounded-2xl p-4">
        <Input label="Nome" value={name} onChange={setName} />
        <Input label="Categoria" value={category} onChange={setCategory} />
        <Input label="Preço" value={price} onChange={setPrice} />

        <label className="flex cursor-pointer flex-col text-xs text-muted-foreground">
          Foto
          <span className={`mt-1 flex h-9 w-20 items-center justify-center rounded-xl border border-dashed border-input text-[11px] ${imagePreview ? "border-primary text-primary" : ""}`}>
            {imagePreview ? "✓ pronta" : "+ foto"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageSelect(file);
              }}
            />
          </span>
        </label>

        <button
          type="button"
          disabled={!name.trim() || !price}
          onClick={() => {
            void createProduct({
              name: name.trim(),
              category: category.trim(),
              price: parsePrice(price),
              available: true,
              ...(imagePreview ? { image: imagePreview } : {}),
            });
            setName("");
            setPrice("");
            setImagePreview(null);
          }}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 transition active:scale-95"
        >
          <Plus className="inline h-3.5 w-3.5" /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="panel flex items-center gap-3 rounded-xl p-3">
            <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-dashed border-input">
              {p.image ? (
                <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  {uploadingId === p.id ? "…" : "+ foto"}
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageSelect(file, p.id);
                }}
              />
            </label>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.category} ·{" "}
                {p.sizes?.length
                  ? p.sizes.map((s) => `${s.name} ${formatBRL(s.price)}`).join(" · ")
                  : formatBRL(p.price)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void updateProduct(p.id, { available: !p.available })}
                className={`rounded-full border px-3 py-1 text-[11px] transition active:scale-95 ${
                  p.available ? "border-success text-success" : "border-border text-muted-foreground"
                }`}
              >
                <Check className="inline h-3 w-3" /> {p.available ? "Disponível" : "Pausado"}
              </button>
              <button
                type="button"
                onClick={() => void deleteProduct(p.id)}
                aria-label="Excluir produto"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ settings }: { settings: ShopSettings | null }) {
  const [form, setForm] = useState<ShopSettings>({
    name: "Pizzaria Torre Arantes",
    whatsapp: "",
    tagline: "",
    estimatedTime: "40–60 min",
    minOrderValue: 0,
    defaultDeliveryFee: 0,
    storeClosed: false,
    autoPrint: true,
    printCopies: 1,
  });

  useEffect(() => {
    if (settings) setForm((f) => ({ ...f, ...settings }));
  }, [settings]);

  return (
    <div className="panel space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap gap-2">
        <Input label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Input
          label="WhatsApp"
          value={form.whatsapp}
          onChange={(v) => setForm({ ...form, whatsapp: v })}
        />
        <Input
          label="Tempo estimado"
          value={form.estimatedTime ?? ""}
          onChange={(v) => setForm({ ...form, estimatedTime: v })}
        />
        <Input
          label="Taxa de entrega"
          value={String(form.defaultDeliveryFee ?? 0)}
          onChange={(v) => setForm({ ...form, defaultDeliveryFee: parsePrice(v) })}
        />
        <Input
          label="Pedido mínimo"
          value={String(form.minOrderValue ?? 0)}
          onChange={(v) => setForm({ ...form, minOrderValue: parsePrice(v) })}
        />
        <Input
          label="Vias impressas"
          value={String(form.printCopies ?? 1)}
          onChange={(v) => setForm({ ...form, printCopies: Math.max(1, Number(v) || 1) })}
        />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Toggle
          label="Loja fechada"
          value={Boolean(form.storeClosed)}
          onChange={(v) => setForm({ ...form, storeClosed: v })}
        />
        <Toggle
          label="Impressão automática após pagamento"
          value={form.autoPrint !== false}
          onChange={(v) => setForm({ ...form, autoPrint: v })}
        />
      </div>
      <button
        type="button"
        onClick={() => void saveShopSettings(form)}
        className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition active:scale-95"
      >
        Salvar ajustes
      </button>
    </div>
  );
}
function CouponsTab({ coupons }: { coupons: Coupon[] }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"fixed" | "percent">("fixed");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxUses, setMaxUses] = useState("");

  async function handleSave() {
    if (!code.trim() || !value) return;
    await saveCoupon({
      code: code.trim().toUpperCase(),
      type,
      value: parsePrice(value),
      active: true,
      minOrderValue: minOrder ? parsePrice(minOrder) : null,
      maxUses: maxUses ? Number(maxUses) : null,
      uses: 0,
    });
    setCode(""); setValue(""); setMinOrder(""); setMaxUses("");
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-2 rounded-2xl p-4">
        <Input label="Código" value={code} onChange={(v) => setCode(v.toUpperCase())} />
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tipo
          <div className="flex gap-1 mt-1">
            <button
              type="button"
              onClick={() => setType("fixed")}
              className={`rounded-full border px-3 py-2 text-[11px] transition active:scale-95 ${type === "fixed" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              R$ fixo
            </button>
            <button
              type="button"
              onClick={() => setType("percent")}
              className={`flex items-center gap-1 rounded-full border px-3 py-2 text-[11px] transition active:scale-95 ${type === "percent" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              <Percent className="h-3 w-3" /> %
            </button>
          </div>
        </div>
        <Input label={type === "fixed" ? "Valor (R$)" : "Valor (%)"} value={value} onChange={setValue} />
        <Input label="Pedido mínimo (R$)" value={minOrder} onChange={setMinOrder} />
        <Input label="Máx. usos (vazio = ∞)" value={maxUses} onChange={setMaxUses} />
        <button
          type="button"
          disabled={!code.trim() || !value}
          onClick={() => void handleSave()}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 transition active:scale-95"
        >
          <Plus className="inline h-3.5 w-3.5" /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {coupons.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cupom cadastrado.</p>
        ) : null}
        {coupons.map((c) => (
          <div key={c.id} className="panel flex items-center gap-3 rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{c.code}</p>
              <p className="text-xs text-muted-foreground">
                {c.type === "fixed" ? `R$ ${c.value.toFixed(2)} OFF` : `${c.value}% OFF`}
                {c.minOrderValue ? ` · mín. R$ ${c.minOrderValue.toFixed(2)}` : ""}
                {c.maxUses ? ` · ${c.uses ?? 0}/${c.maxUses} usos` : ` · ${c.uses ?? 0} usos`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void saveCoupon({ ...c, active: !c.active })}
                className={`rounded-full border px-3 py-1 text-[11px] transition active:scale-95 ${
                  c.active ? "border-success text-success" : "border-border text-muted-foreground"
                }`}
              >
                {c.active ? "Ativo" : "Inativo"}
              </button>
              <button
                type="button"
                onClick={() => void deleteCoupon(c.id)}
                aria-label="Excluir cupom"
                className="text-muted-foreground hover:text-destructive transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-44 rounded-xl border border-input bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`rounded-full border px-3 py-1.5 transition active:scale-95 ${
  value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {label}: {value ? "sim" : "não"}
    </button>
  );
}
