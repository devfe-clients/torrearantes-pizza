import { useEffect, useState } from "react";
import { X, Trash2, Plus, ImageOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { compressImage, updateProduct, deleteProduct } from "@/lib/firestore";
import { parsePrice, formatBRL } from "@/lib/format";
import type { Category, Product, ProductSize } from "@/lib/types";

type Draft = {
  name: string;
  description: string;
  category: string;
  price: string;
  promoPrice: string;
  stock: string;
  available: boolean;
  featured: boolean;
  images: string[];
  sizes: ProductSize[];
};

function toDraft(p: Product): Draft {
  return {
    name: p.name,
    description: p.description ?? "",
    category: p.category,
    price: String(p.price ?? 0),
    promoPrice: p.promoPrice ? String(p.promoPrice) : "",
    stock: p.stock === null || p.stock === undefined ? "" : String(p.stock),
    available: p.available,
    featured: Boolean(p.featured),
    // compatibilidade: migra image legado para o array
    images: p.images?.length ? p.images : p.image ? [p.image] : [],
    sizes: p.sizes ?? [],
  };
}

export function ProductEditor({
  product,
  categories,
  onClose,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(product ? toDraft(product) : null);
  }, [product]);

  if (!product || !draft) return null;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function handleImages(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const compressed = await compressImage(e.target?.result as string);
        setDraft((d) => (d ? { ...d, images: [...d.images, compressed] } : d));
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleSave() {
    if (!product || !draft) return;
    if (!draft.name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const price = parsePrice(draft.price);
    const promo = draft.promoPrice ? parsePrice(draft.promoPrice) : 0;
    if (promo && promo >= price && !draft.sizes.length) {
      toast.error("O preço promocional precisa ser menor que o preço normal.");
      return;
    }
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        price,
        promoPrice: promo > 0 ? promo : null,
        stock: draft.stock === "" ? null : Math.max(0, Number(draft.stock) || 0),
        available: draft.available,
        featured: draft.featured,
        image: draft.images[0] ?? "",
        images: draft.images,
        sizes: draft.sizes.length ? draft.sizes : null,
      });
      toast.success("Produto atualizado.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const promoActive = draft.promoPrice
    ? parsePrice(draft.promoPrice) > 0 && parsePrice(draft.promoPrice) < parsePrice(draft.price)
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
      <div className="panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="gold-text text-base">Editar produto</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            {/* galeria de fotos */}
            <div className="flex-1 space-y-2">
              <Field label="Nome">
                <input
                  value={draft.name}
                  maxLength={80}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={draft.category}
                  onChange={(e) => set("category", e.target.value)}
                  className={inputCls}
                >
                  {[draft.category, ...categories.map((c) => c.name)]
                    .filter((v, i, arr) => v && arr.indexOf(v) === i)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          </div>

          {/* miniaturas + botão adicionar */}
          <div className="flex flex-wrap gap-2">
            {draft.images.map((src, i) => (
              <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remover foto"
                  onClick={() => set("images", draft.images.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
                {i === 0 && draft.images.length > 1 ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-primary/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    capa
                  </span>
                ) : null}
              </div>
            ))}
            <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-[10px] text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4" />
              adicionar foto
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* abre o bloco de nome/categoria que estava dentro do flex gap-3 */}
          <div className="hidden">
          </div>

          <Field label="Descrição">
            <textarea
              value={draft.description}
              maxLength={300}
              rows={3}
              placeholder="Ex.: molho artesanal, mussarela, manjericão fresco."
              onChange={(e) => set("description", e.target.value)}
              className={`${inputCls} resize-none`}
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {draft.description.length}/300
            </span>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Preço (R$)">
              <input
                value={draft.price}
                inputMode="decimal"
                onChange={(e) => set("price", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Promoção (R$)">
              <input
                value={draft.promoPrice}
                inputMode="decimal"
                placeholder="vazio = sem"
                onChange={(e) => set("promoPrice", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Estoque">
              <input
                value={draft.stock}
                inputMode="numeric"
                placeholder="ilimitado"
                onChange={(e) => set("stock", e.target.value.replace(/\D/g, ""))}
                className={inputCls}
              />
            </Field>
          </div>

          {promoActive ? (
            <p className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
              Em promoção: de {formatBRL(parsePrice(draft.price))} por{" "}
              {formatBRL(parsePrice(draft.promoPrice))}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Tamanhos (opcional — quando houver, o preço base é ignorado)
            </p>
            <div className="space-y-2">
              {draft.sizes.map((size, i) => (
                <div key={size.id} className="flex items-center gap-2">
                  <input
                    value={size.name}
                    placeholder="Broto"
                    onChange={(e) =>
                      set(
                        "sizes",
                        draft.sizes.map((s, j) =>
                          j === i ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    value={String(size.price)}
                    inputMode="decimal"
                    placeholder="Preço"
                    onChange={(e) =>
                      set(
                        "sizes",
                        draft.sizes.map((s, j) =>
                          j === i ? { ...s, price: parsePrice(e.target.value) } : s,
                        ),
                      )
                    }
                    className={`${inputCls} w-24`}
                  />
                  <input
                    value={size.promoPrice ? String(size.promoPrice) : ""}
                    inputMode="decimal"
                    placeholder="Promo"
                    onChange={(e) =>
                      set(
                        "sizes",
                        draft.sizes.map((s, j) =>
                          j === i
                            ? { ...s, promoPrice: e.target.value ? parsePrice(e.target.value) : null }
                            : s,
                        ),
                      )
                    }
                    className={`${inputCls} w-24`}
                  />
                  <button
                    type="button"
                    aria-label="Remover tamanho"
                    onClick={() => set("sizes", draft.sizes.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  set("sizes", [
                    ...draft.sizes,
                    { id: crypto.randomUUID().slice(0, 8), name: "", price: 0, promoPrice: null },
                  ])
                }
                className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground"
              >
                <Plus className="h-3 w-3" /> Adicionar tamanho
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Chip active={draft.available} onClick={() => set("available", !draft.available)}>
              {draft.available ? "Disponível" : "Pausado"}
            </Chip>
            <Chip active={draft.featured} onClick={() => set("featured", !draft.featured)}>
              {draft.featured ? "Em destaque" : "Sem destaque"}
            </Chip>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (!confirm(`Excluir "${product.name}"?`)) return;
                void deleteProduct(product.id).then(() => {
                  toast.success("Produto excluído.");
                  onClose();
                });
              }}
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 px-4 py-2 text-xs text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "block w-full rounded-xl border border-input bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
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
      className={`rounded-full border px-3 py-1.5 transition active:scale-95 ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
