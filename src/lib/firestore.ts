/**
 * Camada de acesso ao Firestore.
 *
 * Estrutura das coleções (crie no console ou deixe o app criar):
 *   products/{id}        -> Product
 *   categories/{name}    -> Category
 *   coupons/{id}         -> Coupon
 *   orders/{id}          -> Order
 *   settings/shop        -> ShopSettings
 *
 * IMPORTANTE (segurança): o frontend NUNCA é fonte de verdade.
 * - preço, taxa de entrega, desconto e total são recalculados no servidor
 *   (src/lib/checkout.server.ts) antes de criar a cobrança;
 * - status de pagamento só muda via webhook do Mercado Pago;
 * - as regras em firebase/firestore.rules bloqueiam escrita do cliente em
 *   campos sensíveis.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import type { Category, Coupon, Order, OrderStatus, Product, ShopSettings } from "./types";
import { DEFAULT_CATEGORIES } from "./types";

const COL_PRODUCTS = "products";
const COL_CATEGORIES = "categories";
const COL_ORDERS = "orders";
const COL_COUPONS = "coupons";

/* ------------------------------- PRODUCTS ------------------------------- */

export function subscribeProducts(cb: (items: Product[]) => void, onError?: (e: Error) => void) {
  const { db } = getFirebase();
  return onSnapshot(
    query(collection(db, COL_PRODUCTS), orderBy("category")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, "id">) }))),
    (e) => onError?.(e),
  );
}

export async function listProducts(): Promise<Product[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, COL_PRODUCTS), orderBy("category")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, "id">) }));
}

async function compressImage(base64: string, max = 900): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > max || height > max) {
        if (width > height) {
          height = Math.round((height * max) / width);
          width = max;
        } else {
          width = Math.round((width * max) / height);
          height = max;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

export async function createProduct(p: Omit<Product, "id">) {
  const { db } = getFirebase();
  const data = p.image ? { ...p, image: await compressImage(p.image) } : p;
  return addDoc(collection(db, COL_PRODUCTS), { ...data, createdAt: Date.now() });
}

export async function updateProduct(id: string, p: Partial<Product>) {
  const { db } = getFirebase();
  const data = p.image ? { ...p, image: await compressImage(p.image) } : p;
  return updateDoc(doc(db, COL_PRODUCTS, id), data as Record<string, unknown>);
}

export async function deleteProduct(id: string) {
  const { db } = getFirebase();
  return deleteDoc(doc(db, COL_PRODUCTS, id));
}

/* ------------------------------ CATEGORIES ------------------------------ */

export function subscribeCategories(cb: (items: Category[]) => void) {
  const { db } = getFirebase();
  return onSnapshot(collection(db, COL_CATEGORIES), (snap) => {
    const items = snap.docs.map((d) => d.data() as Category);
    cb(items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  });
}

export async function saveCategories(items: Category[]) {
  const { db } = getFirebase();
  const existing = await getDocs(collection(db, COL_CATEGORIES));
  await Promise.all(
    existing.docs
      .filter((d) => !items.some((c) => c.name === d.id))
      .map((d) => deleteDoc(doc(db, COL_CATEGORIES, d.id))),
  );
  await Promise.all(
    items.map((c, i) => setDoc(doc(db, COL_CATEGORIES, c.name), { name: c.name, order: i })),
  );
}

export async function ensureCategoriesSeed() {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, COL_CATEGORIES), limit(1)));
  if (!snap.empty) return;
  await saveCategories(DEFAULT_CATEGORIES.map((name, order) => ({ name, order })));
}

/* -------------------------------- ORDERS -------------------------------- */

export function subscribeOrders(cb: (items: Order[]) => void, onError?: (e: Error) => void) {
  const { db } = getFirebase();
  return onSnapshot(
    query(collection(db, COL_ORDERS), orderBy("createdAt", "desc"), limit(200)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, "id">) }))),
    (e) => onError?.(e),
  );
}

export function subscribeOrder(id: string, cb: (order: Order | null) => void) {
  const { db } = getFirebase();
  return onSnapshot(doc(db, COL_ORDERS, id), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Order, "id">) }) : null);
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, COL_ORDERS, id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Order, "id">) }) : null;
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  const { db } = getFirebase();
  return updateDoc(doc(db, COL_ORDERS, id), { status });
}

export async function markOrderPrinted(id: string) {
  const { db } = getFirebase();
  return updateDoc(doc(db, COL_ORDERS, id), { printed: true, printedAt: Date.now() });
}

export async function deleteOrder(id: string) {
  const { db } = getFirebase();
  return deleteDoc(doc(db, COL_ORDERS, id));
}

/* ------------------------------- COUPONS -------------------------------- */

export function subscribeCoupons(cb: (items: Coupon[]) => void) {
  const { db } = getFirebase();
  return onSnapshot(collection(db, COL_COUPONS), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coupon, "id">) }))),
  );
}

export async function saveCoupon(c: Omit<Coupon, "id"> & { id?: string }) {
  const { db } = getFirebase();
  const { id, ...data } = c;
  if (id) return updateDoc(doc(db, COL_COUPONS, id), data as Record<string, unknown>);
  return addDoc(collection(db, COL_COUPONS), { ...data, uses: 0 });
}

export async function deleteCoupon(id: string) {
  const { db } = getFirebase();
  return deleteDoc(doc(db, COL_COUPONS, id));
}

export async function findCouponByCode(code: string): Promise<Coupon | null> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, COL_COUPONS), where("code", "==", code.trim().toUpperCase()), limit(1)),
  );
  const d = snap.docs[0];
  return d ? ({ id: d.id, ...(d.data() as Omit<Coupon, "id">) }) : null;
}

/* ------------------------------- SETTINGS ------------------------------- */

export function subscribeShopSettings(cb: (s: ShopSettings | null) => void) {
  const { db } = getFirebase();
  return onSnapshot(doc(db, "settings", "shop"), (snap) =>
    cb(snap.exists() ? (snap.data() as ShopSettings) : null),
  );
}

export async function saveShopSettings(s: Partial<ShopSettings>) {
  const { db } = getFirebase();
  return setDoc(doc(db, "settings", "shop"), s, { merge: true });
}
