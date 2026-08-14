import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { saveCategories, updateProduct } from "@/lib/firestore";
import type { Category, Product } from "@/lib/types";

export function CategoriesTab({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  const [items, setItems] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setItems(categories.map((c) => c.name));
  }, [categories, dirty]);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setItems(next);
    setDirty(true);
  }

  function addCategory() {
    const name = newName.trim();
    if (!name) return;
    if (items.some((n) => n.toLowerCase() === name.toLowerCase())) {
      toast.error("Essa categoria já existe.");
      return;
    }
    setItems([...items, name]);
    setNewName("");
    setDirty(true);
    toast.message(`"${name}" adicionada à lista`, {
      description: "Clique em Publicar alterações para aparecer no cardápio.",
    });
  }

  function removeCategory(name: string) {
    const count = products.filter((p) => p.category === name).length;
    if (count > 0) {
      toast.error(`"${name}" tem ${count} produto(s). Mova-os antes de excluir.`);
      return;
    }
    setItems(items.filter((n) => n !== name));
    setDirty(true);
  }

  async function confirmRename(oldName: string) {
    const name = editValue.trim();
    setEditing(null);
    if (!name || name === oldName) return;
    setItems(items.map((n) => (n === oldName ? name : n)));
    setDirty(true);
    const affected = products.filter((p) => p.category === oldName);
    await Promise.all(affected.map((p) => updateProduct(p.id, { category: name })));
    if (affected.length) toast.success(`${affected.length} produto(s) movidos para "${name}".`);
  }

  async function publish() {
    setSaving(true);
    try {
      await saveCategories(items.map((name, order) => ({ name, order })));
      setDirty(false);
      toast.success("Categorias publicadas no cardápio.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 rounded-2xl p-4">
        <div>
          <p className="text-sm font-semibold">Nova categoria</p>
          <p className="text-xs text-muted-foreground">
            Adicione, renomeie e arraste a ordem em que ela aparece no cardápio. As mudanças só
            entram no ar depois de publicar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            maxLength={40}
            placeholder="Ex.: Pizzas Especiais"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
            }}
            className="min-w-52 flex-1 rounded-xl border border-input bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={addCategory}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 transition active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma categoria cadastrada.
          </p>
        ) : null}
        {items.map((name, i) => {
          const count = products.filter((p) => p.category === name).length;
          return (
            <div key={name} className="panel flex items-center gap-3 rounded-xl p-3">
              <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {editing === name ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editValue}
                      autoFocus
                      maxLength={40}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmRename(name);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="w-full rounded-lg border border-input bg-secondary/40 px-2 py-1 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      aria-label="Confirmar"
                      onClick={() => void confirmRename(name)}
                      className="text-success"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancelar"
                      onClick={() => setEditing(null)}
                      className="text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "produto" : "produtos"}
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="rounded-lg border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Descer"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                  className="rounded-lg border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Renomear"
                  onClick={() => {
                    setEditing(name);
                    setEditValue(name);
                  }}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Excluir categoria"
                  onClick={() => removeCategory(name)}
                  className="rounded-lg border border-destructive/40 p-1.5 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/90 px-4 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty ? "Você tem alterações não publicadas." : "Tudo publicado no cardápio."}
        </p>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void publish()}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 transition active:scale-95"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Publicar alterações
        </button>
      </div>
    </div>
  );
}
