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

type Tab = "pedidos" | "produtos" | "ajustes";

export function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("pedidos");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);

  const printer = usePrinter(settings);
  useAutoPrint(orders, printer, settings?.autoPrint !== false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true);
      return;
    }
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setReady(true);
      if (!user) void navigate({ to: "/auth" });
    });
  }, [navigate]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const u1 = subscribeOrders(setOrders);
    const u2 = subscribeProducts(setProducts);
    const u3 = subscribeShopSettings(setSettings);
    void ensureCategoriesSeed().catch(() => undefined);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
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
            <button
              type="button"
              onClick={() => void signOut(getFirebase().auth)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5"
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
                className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary"
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
                className={`rounded-full border px-3 py-1 text-[11px] ${
                  order.status === s ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {ORDER_STATUS_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void deleteOrder(order.id)}
              className="rounded-full border border-destructive/40 px-3 py-1 text-[11px] text-destructive"
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

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-2 rounded-2xl p-4">
        <Input label="Nome" value={name} onChange={setName} />
        <Input label="Categoria" value={category} onChange={setCategory} />
        <Input label="Preço" value={price} onChange={setPrice} />
        <button
          type="button"
          disabled={!name.trim() || !price}
          onClick={() => {
            void createProduct({
              name: name.trim(),
              category: category.trim(),
              price: parsePrice(price),
              available: true,
            });
            setName("");
            setPrice("");
          }}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="inline h-3.5 w-3.5" /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="panel flex items-center justify-between gap-3 rounded-xl p-3">
            <div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.category} ·{" "}
                {p.sizes?.length
                  ? p.sizes.map((s) => `${s.name} ${formatBRL(s.price)}`).join(" · ")
                  : formatBRL(p.price)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void updateProduct(p.id, { available: !p.available })}
                className={`rounded-full border px-3 py-1 text-[11px] ${
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
      <p className="text-xs text-muted-foreground">
        Tamanhos, adicionais e fotos podem ser preenchidos no Firestore (campos sizes, extras,
        image) — a tela lê tudo automaticamente.
      </p>
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
        className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
      >
        Salvar ajustes
      </button>
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
      className={`rounded-full border px-3 py-1.5 ${
        value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {label}: {value ? "sim" : "não"}
    </button>
  );
}
