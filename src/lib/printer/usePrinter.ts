import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  getPrinterName,
  isPrinterConnected,
  isWebBluetoothSupported,
  printBytes,
  printViaRawBT,
} from "./bluetooth";
import { buildOrderReceipt } from "./escpos";
import type { Order, ShopSettings } from "../types";
import { markOrderPrinted } from "../firestore";

export function usePrinter(settings: ShopSettings | null) {
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const printing = useRef(new Set<string>());

  useEffect(() => {
    const i = window.setInterval(() => setConnected(isPrinterConnected()), 2000);
    return () => window.clearInterval(i);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const deviceName = await connectPrinter();
      setName(deviceName);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectPrinter();
    setConnected(false);
    setName(null);
  }, []);

  const printOrder = useCallback(
    async (order: Order, { markPrinted = true }: { markPrinted?: boolean } = {}) => {
      if (printing.current.has(order.id)) return;
      printing.current.add(order.id);
      try {
        const bytes = buildOrderReceipt(order, {
          width: settings?.printerWidth ?? 32,
          shopName: settings?.name,
          shopPhone: settings?.whatsapp,
        });
        const copies = Math.max(1, settings?.printCopies ?? 1);
        if (isPrinterConnected()) {
          for (let i = 0; i < copies; i++) await printBytes(bytes);
        } else if (!isWebBluetoothSupported()) {
          printViaRawBT(bytes);
        } else {
          throw new Error("Impressora não conectada.");
        }
        if (markPrinted) await markOrderPrinted(order.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao imprimir.");
        throw e;
      } finally {
        printing.current.delete(order.id);
      }
    },
    [settings],
  );

  return {
    connected,
    name: name ?? getPrinterName(),
    error,
    busy,
    supported: isWebBluetoothSupported(),
    connect,
    disconnect,
    printOrder,
    clearError: () => setError(null),
  };
}

/**
 * Imprime automaticamente toda notinha de pedido cujo pagamento foi
 * confirmado (status !== aguardando_pagamento) e que ainda não foi impressa.
 */
export function useAutoPrint(
  orders: Order[],
  printer: ReturnType<typeof usePrinter>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !printer.connected) return;
    const pending = orders.filter(
      (o) => !o.printed && o.status !== "aguardando_pagamento" && o.status !== "cancelado",
    );
    if (!pending.length) return;
    void (async () => {
      for (const order of pending) {
        try {
          await printer.printOrder(order);
        } catch {
          break;
        }
      }
    })();
  }, [orders, enabled, printer]);
}
