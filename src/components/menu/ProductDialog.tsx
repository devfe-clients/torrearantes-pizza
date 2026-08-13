import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X, Flame } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { estimatePrice, lineKey, type CartLine } from "@/lib/cart";

type Props = {
  product: Product | null;
  products: Product[];
  onClose: () => void;
  onAdd: (line: CartLine) => void;
};

export function ProductDialog({ product, products, onClose, onAdd }: Props) {
  const [sizeId, setSizeId] = useState<string | undefined>(undefined);
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!product) return;
    setSizeId(product.sizes?.[0]?.id);
    setFlavorIds([]);
    setExtraIds([]);
    setNote("");
    setQuantity(1);
  }, [product]);

  const flavorOptions = useMemo(
    () =>
      product
        ? products.filter(
            (p) => p.available && p.category === product.category && p.id !== product.id,
          )
        : [],
    [product, products],
  );

  const selectedFlavors = useMemo(
    () => flavorIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[],
    [flavorIds, products],
  );

  if (!product) return null;

  const maxFlavors = product.maxFlavors ?? 1;
  const unitPrice = estimatePrice(product, sizeId, selectedFlavors, extraIds);
  const size = product.sizes?.find((s) => s.id === sizeId);
  const noteMissing = Boolean(product.requiresNote) && !note.trim();

  function toggleFlavor(id: string) {
    setFlavorIds((prev) =>
      prev.includes(id)
        ? prev.filter((f) => f !== id)
        : prev.length >= maxFlavors - 1
          ? [...prev.slice(1), id]
          : [...prev, id],
    );
  }

  function toggleExtra(id: string) {
    setExtraIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  function handleAdd() {
    if (noteMissing) return;
    const base = {
      productId: product!.id,
      name: product!.name,
      image: product!.image,
      sizeId,
      sizeName: size?.name,
      flavorIds,
      flavorNames: selectedFlavors.map((f) => f.name),
      extraIds,
      extraNames: extraIds.map(
        (id) => product!.extras?.find((e) => e.id === id)?.name ?? "",
      ),
      note: note.trim() || undefined,
      unitPrice,
    };
    onAdd({ ...base, key: lineKey(base), quantity });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="relative">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="h-48 w-full rounded-t-3xl object-cover"
            />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-t-3xl bg-secondary">
              <Flame className="h-8 w-8 text-primary" />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 rounded-full bg-background/80 p-2 text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <h2 className="text-xl font-semibold">{product.name}</h2>
            {product.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
            ) : null}
          </div>

          {product.sizes?.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Escolha o tamanho
              </p>
              <div className="grid gap-2">
                {product.sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                      sizeId === s.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    <span>
                      {s.name}
                      {s.slices ? (
                        <span className="text-muted-foreground"> · {s.slices} fatias</span>
                      ) : null}
                    </span>
                    <span className="font-semibold">{formatBRL(s.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {maxFlavors > 1 && flavorOptions.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Segundo sabor (opcional) · até {maxFlavors} sabores
              </p>
              <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
                {flavorOptions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFlavor(f.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      flavorIds.includes(f.id)
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    <span>{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBRL(
                        size ? (f.sizes?.find((s) => s.name === size.name)?.price ?? f.price) : f.price,
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Em pizzas de mais de um sabor, vale o preço do sabor mais caro.
              </p>
            </section>
          ) : null}

          {product.extras?.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Adicionais
              </p>
              <div className="grid gap-2">
                {product.extras.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleExtra(e.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      extraIds.includes(e.id)
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    <span>{e.name}</span>
                    <span className="text-xs">+ {formatBRL(e.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-primary">
              Observação {product.requiresNote ? "(obrigatória)" : "(opcional)"}
            </label>
            <textarea
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={product.notePlaceholder ?? "Ex.: sem cebola, capricha no orégano"}
              className="min-h-20 w-full rounded-xl border border-input bg-secondary/40 p-3 text-sm outline-none focus:border-primary"
            />
          </section>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2">
              <button
                type="button"
                aria-label="Diminuir"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-semibold">{quantity}</span>
              <button
                type="button"
                aria-label="Aumentar"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={noteMissing}
              className="flex flex-1 items-center justify-between rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <span>Adicionar</span>
              <span>{formatBRL(unitPrice * quantity)}</span>
            </button>
          </div>
          {noteMissing ? (
            <p className="text-xs text-destructive">Este item exige uma observação.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
