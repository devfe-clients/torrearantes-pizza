type Json = Record<string, unknown>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const clientEmail = env("FIREBASE_CLIENT_EMAIL");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env("FIREBASE_PRIVATE_KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao autenticar no Google: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function docUrl(path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${env("FIREBASE_PROJECT_ID")}/databases/(default)/documents/${path}`;
}

/* ------- conversão entre JSON simples e o formato tipado do Firestore ------ */

export function toFirestoreValue(value: unknown): Json {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  if (typeof value === "object")
    return { mapValue: { fields: toFirestoreFields(value as Json) } };
  return { nullValue: null };
}

export function toFirestoreFields(obj: Json): Json {
  const fields: Json = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}

export function fromFirestoreValue(value: Json): unknown {
  if ("stringValue" in value) return value["stringValue"];
  if ("booleanValue" in value) return value["booleanValue"];
  if ("integerValue" in value) return Number(value["integerValue"]);
  if ("doubleValue" in value) return Number(value["doubleValue"]);
  if ("nullValue" in value) return null;
  if ("arrayValue" in value)
    return (((value["arrayValue"] as Json)["values"] as Json[]) ?? []).map(fromFirestoreValue);
  if ("mapValue" in value)
    return fromFirestoreFields(((value["mapValue"] as Json)["fields"] as Json) ?? {});
  return null;
}

export function fromFirestoreFields(fields: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v as Json);
  return out;
}

/* -------------------------------- API ----------------------------------- */

export async function adminGetDoc(path: string): Promise<Json | null> {
  const res = await fetch(docUrl(path), {
    headers: { authorization: `Bearer ${await getAccessToken()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path}: ${res.status}`);
  const data = (await res.json()) as Json;
  return fromFirestoreFields((data["fields"] as Json) ?? {});
}

export async function adminCreateDoc(collection: string, id: string, data: Json): Promise<void> {
  const res = await fetch(`${docUrl(collection)}?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await getAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore CREATE ${collection}: ${res.status}`);
}

export async function adminUpdateDoc(path: string, data: Json): Promise<void> {
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const res = await fetch(`${docUrl(path)}?${mask}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${await getAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${path}: ${res.status}`);
}

export async function adminQuery(
  collection: string,
  field: string,
  value: string,
  limit = 1,
): Promise<{ id: string; data: Json }[]> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env("FIREBASE_PROJECT_ID")}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } },
          },
          limit,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Firestore QUERY ${collection}: ${res.status}`);
  const rows = (await res.json()) as { document?: { name: string; fields: Json } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop()!,
      data: fromFirestoreFields(r.document!.fields ?? {}),
    }));
}
