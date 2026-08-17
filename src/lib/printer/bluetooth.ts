/**
 * Conexão com a mini impressora térmica Bluetooth 58mm (MPT-II).
 *
 * Caminho principal: Web Bluetooth (Chrome no Android / desktop).
 * A impressora expõe o serviço serial 000018f0-... com a característica
 * 00002af1-... para escrita de bytes ESC/POS.
 *
 * Caminho alternativo (Android sem Web Bluetooth): app RawBT via intent
 * `rawbt:base64,<dados>` — ver printViaRawBT().
 */

const PRINTER_SERVICES = [
  0x18f0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];
const WRITE_CHARACTERISTICS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
];

const CHUNK_SIZE = 180;

type BluetoothDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<unknown>;
    disconnect: () => void;
  };
  addEventListener: (type: string, cb: () => void) => void;
};

let device: BluetoothDeviceLike | null = null;
let characteristic: { writeValue: (v: BufferSource) => Promise<void> } | null = null;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function isPrinterConnected(): boolean {
  return Boolean(characteristic && device?.gatt?.connected);
}

export function getPrinterName(): string | null {
  return device?.name ?? null;
}

/** Abre o seletor do navegador e conecta na impressora. */
export async function connectPrinter(): Promise<string> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      "Este navegador não suporta Bluetooth. Use o Chrome no Android ou o app RawBT.",
    );
  }
  const bt = (navigator as unknown as { bluetooth: any }).bluetooth;
  device = (await bt.requestDevice({
    filters: PRINTER_SERVICES.map((s) => ({ services: [s] })).concat([
      { namePrefix: "MPT" },
      { namePrefix: "Printer" },
      { namePrefix: "BlueTooth Printer" },
    ] as any),
    optionalServices: PRINTER_SERVICES,
  })) as BluetoothDeviceLike;

  device.addEventListener("gattserverdisconnected", () => {
    characteristic = null;
  });

  const server: any = await device.gatt!.connect();
  const services: any[] = await server.getPrimaryServices();
  for (const service of services) {
    const chars: any[] = await service.getCharacteristics();
    const writable = chars.find(
      (c) =>
        (c.properties?.write || c.properties?.writeWithoutResponse) &&
        (WRITE_CHARACTERISTICS.includes(c.uuid) || true),
    );
    if (writable) {
      characteristic = writable;
      break;
    }
  }
  if (!characteristic) throw new Error("Não encontrei a característica de escrita da impressora.");
  return device.name ?? "Impressora";
}

export function disconnectPrinter() {
  try {
    device?.gatt?.disconnect();
  } finally {
    device = null;
    characteristic = null;
  }
}

/** Envia bytes ESC/POS em blocos (o MTU BLE é pequeno). */
export async function printBytes(data: Uint8Array): Promise<void> {
  if (!characteristic) throw new Error("Impressora não conectada.");
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const slice = data.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(slice as unknown as BufferSource);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Fallback Android: abre o app RawBT com os bytes já formatados. */
export function printViaRawBT(data: Uint8Array) {
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  window.location.href = `rawbt:base64,${btoa(binary)}`;
}
