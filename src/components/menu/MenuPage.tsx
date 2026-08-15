import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, Bike, Clock, Flame, AlertTriangle, Phone } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { productFromPrice, productListPrice } from "@/lib/pricing";
import { isFirebaseConfigured } from "@/lib/firebase";
import { subscribeCategories, subscribeProducts, subscribeShopSettings } from "@/lib/firestore";
import type { Category, Product, ShopSettings } from "@/lib/types";
import {
  cartCount,
  cartSubtotal,
  loadCart,
  saveCart,
  type CartLine,
} from "@/lib/cart";
import { ProductDialog } from "./ProductDialog";
import { CartDrawer } from "./CartDrawer";

export function MenuPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
    const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setLines(loadCart());
    setLastOrderId(localStorage.getItem("last_order_id"));
  }, []);

  useEffect(() => {
    saveCart(lines);
  }, [lines]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfigError(
        "Erro ao carregar o cardápio. Tente novamente em instantes.",
      );
      return;
    }
    try {
      const u1 = subscribeProducts(setProducts, (e) => setConfigError(e.message));
      const u2 = subscribeCategories(setCategories);
      const u3 = subscribeShopSettings(setSettings);
      return () => {
        u1();
        u2();
        u3();
      };
    } catch (e) {
      setConfigError("Erro ao carregar o cardápio. Tente novamente em instantes.");
      return;
    }
  }, []);

  const categoryNames = useMemo(() => {
    const fromProducts = [...new Set(products.map((p) => p.category))];
    const ordered = categories.map((c) => c.name).filter((n) => fromProducts.includes(n));
    return [...ordered, ...fromProducts.filter((n) => !ordered.includes(n))];
  }, [products, categories]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => p.available)
      .filter((p) => (activeCat ? p.category === activeCat : true))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
          : true,
      );
  }, [products, activeCat, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const name of categoryNames) {
      const items = visible.filter((p) => p.category === name);
      if (items.length) map.set(name, items);
    }
    return map;
  }, [visible, categoryNames]);

  function addLine(line: CartLine) {
    setLines((prev) => {
      const existing = prev.find((l) => l.key === line.key);
      if (existing) {
        return prev.map((l) =>
          l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l,
        );
      }
      return [...prev, line];
    });
    setCartOpen(true);
  }

  const count = cartCount(lines);
  const closed = settings?.storeClosed;

  return (
    <div className={`min-h-screen ${count > 0 ? "pb-28" : "pb-0"}`}>
      <header className="relative overflow-hidden border-b border-primary/20">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-5 py-10 text-center">
          <img
            src="/IMG_4531.PNG"
            alt="Pizzaria Torre Arantes"
            className="h-32 w-auto object-contain"
          />
          <h1 className="sr-only">Pizzaria Torre Arantes — Cardápio digital com entrega</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {settings?.tagline ?? "Massa artesanal, forno a lenha e entrega quentinha na sua casa."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <Badge icon={Bike}>Somente delivery</Badge>
            {settings?.estimatedTime ? (
              <Badge icon={Clock}>{settings.estimatedTime}</Badge>
            ) : null}
            {settings?.whatsapp ? <Badge icon={Phone}>{settings.whatsapp}</Badge> : null}
          </div>
        </div>
      </header>

      {closed ? (
        <div className="mx-auto mt-4 flex max-w-4xl items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Estamos fechados no momento
          {settings?.storeReopenAt ? ` — voltamos ${settings.storeReopenAt}.` : "."}
        </div>
      ) : null}

      {configError ? (
        <div className="mx-auto mt-4 flex max-w-4xl items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <span>{configError}</span>
        </div>
      ) : null}

{lastOrderId ? (
  <div className="mx-auto mt-4 flex max-w-4xl items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
    <span>Você tem um pedido em andamento.</span>
    <button
      type="button"
      onClick={() => void navigate({ to: "/pedido/$orderId", params: { orderId: lastOrderId } })}
      className="shrink-0 font-semibold text-primary"
    >
      Acompanhar →
    </button>
  </div>
) : null}

<div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-4xl space-y-3 px-5 py-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={60}
              placeholder="Buscar pizza, bebida, sobremesa..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
            <Chip active={activeCat === null} onClick={() => setActiveCat(null)}>
              Tudo
            </Chip>
            {categoryNames.map((name) => (
              <Chip key={name} active={activeCat === name} onClick={() => setActiveCat(name)}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl space-y-8 px-5 py-6">
        {grouped.size === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum item no cardápio ainda.
          </p>
        ) : null}
        {[...grouped.entries()].map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg">
              <Flame className="h-4 w-4 text-primary" />
              <span className="gold-text">{category}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelected(product)}
                  className="panel flex gap-3 rounded-2xl p-3 text-left transition hover:border-primary/50"
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      <Flame className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{product.name}</p>
                    {product.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {product.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-primary">
                      {product.sizes?.length ? "a partir de " : null}
                      {formatBRL(productFromPrice(product))}
                      {productListPrice(product) ? (
                        <>
                          <span className="text-xs font-normal text-muted-foreground line-through">
                            {formatBRL(productListPrice(product)!)}
                          </span>
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px]">
                            Promoção
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      {count > 0 ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-between rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-gold"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> {count} {count === 1 ? "item" : "itens"}
          </span>
          <span>{formatBRL(cartSubtotal(lines))}</span>
        </button>
      ) : null}

      <ProductDialog
        product={selected}
        products={products}
        onClose={() => setSelected(null)}
        onAdd={addLine}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        settings={settings}
        onChangeQty={(key, delta) =>
          setLines((prev) =>
            prev
              .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
              .filter((l) => l.quantity > 0),
          )
        }
        onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
        onClear={() => setLines([])}
        onOrderCreated={({ orderId, checkoutUrl }) => {
          setCartOpen(false);
          if (checkoutUrl) {
            window.location.href = checkoutUrl;
            return;
          }
          void navigate({ to: "/pedido/$orderId", params: { orderId } });
        }}
      />
<footer className="mt-4 border-t border-primary/20 pt-3 pb-2">
        <div className="flex flex-row justify-between items-start gap-3 px-3 max-w-2xl mx-auto mb-3">

          <div className="flex flex-col gap-1">
            <p className="text-primary text-[8px] md:text-[10px] font-semibold tracking-widest uppercase mb-0.5">Redes Sociais</p>
<a href="https://www.instagram.com/pizza_torrearantes" target="_blank" rel="noopener noreferrer"
   className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors duration-200 text-[9px] md:text-xs">
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
  @pizza_torrearantes
</a>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-primary text-[8px] md:text-[10px] font-semibold tracking-widest uppercase mb-0.5">Pagamentos</p>
            <span className="flex items-center gap-1 text-muted-foreground text-[9px] md:text-xs">
              <svg width="10" height="10" viewBox="0 0 512 512" fill="currentColor"><path d="M112.57 391.19a72.31 72.31 0 0 0 51.36-21.27l86.44-86.45a11.75 11.75 0 0 1 16.56 0l86.77 86.77a72.31 72.31 0 0 0 51.36 21.27h17l-109.3 109.31a75.32 75.32 0 0 1-106.5 0L96.94 391.19zM112.57 120.81h-15.6L206.26 11.5a75.32 75.32 0 0 1 106.5 0L422.07 120.8h-17a72.31 72.31 0 0 0-51.36 21.27l-86.77 86.77a11.71 11.71 0 0 1-16.56 0l-86.44-86.44a72.31 72.31 0 0 0-51.37-21.59zM21.5 206.26l73.72-73.72h17.35a47.35 47.35 0 0 1 33.62 13.93l86.45 86.45a36.68 36.68 0 0 0 51.84 0l86.77-86.77a47.35 47.35 0 0 1 33.62-13.93h22.78l73.87 73.87a75.32 75.32 0 0 1 0 106.5l-73.87 73.87h-22.78a47.35 47.35 0 0 1-33.62-13.93l-86.77-86.77a36.91 36.91 0 0 0-51.84 0l-86.45 86.45a47.35 47.35 0 0 1-33.62 13.93H95.22L21.5 312.76a75.32 75.32 0 0 1 0-106.5z"/></svg>
              PIX
            </span>
            <span className="flex items-center gap-1 text-muted-foreground text-[9px] md:text-xs">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              Crédito/Débito
            </span>
            <span className="flex items-center gap-1 text-muted-foreground text-[9px] md:text-xs">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Dinheiro
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-primary text-[8px] md:text-[10px] font-semibold tracking-widest uppercase mb-0.5">Localização</p>
            <a href="https://maps.google.com/?q=Torre+Arantes+Pizzaria" target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-1 text-muted-foreground hover:text-primary transition-colors duration-200 text-[9px] md:text-xs">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span>Rua comendador Otto Carlos Golanda, 200<br/>- Ocian</span>
            </a>
          </div>

        </div>
        <div className="flex items-center justify-center gap-3 mb-2 opacity-20">
          <div className="h-px w-16 bg-primary" />
          <div className="w-1 h-1 rounded-full bg-primary" />
          <div className="h-px w-16 bg-primary" />
        </div>

        <div className="flex flex-col items-center gap-1 text-center pb-1">
          <p className="text-muted-foreground text-[10px] opacity-40">
            © {new Date().getFullYear()} Torre Arantes Pizzaria — Todos os direitos reservados
          </p>
          <a
            href="https://fhtech.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity duration-300 text-[10px] text-muted-foreground"
          >
            Developed by <span className="text-primary font-semibold">FH Tech</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

function Badge({ icon: Icon, children }: { icon: typeof Bike; children: React.ReactNode }) {
  return (
    <span className="gold-border flex items-center gap-1.5 rounded-full px-3 py-1 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {children}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary/40 text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
