import crypto from "node:crypto";

export async function verifyJwtHS256(token: string, secret: string): Promise<boolean> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return false;
    const data = `${h}.${p}`;
    const sig = base64url(crypto.createHmac("sha256", secret).update(data).digest());
    if (!timingSafeEqualURL(s, sig)) return false;
    const payload = JSON.parse(Buffer.from(p.replaceAll('-', "+").replaceAll('_', "/"), "base64").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > Number(payload.exp)) return false;
    return true;
  } catch {
    return false;
  }
}

function base64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll('=', "")
    .replaceAll('+', "-")
    .replaceAll('/', "_");
}

function timingSafeEqualURL(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function parseAuthHeader(header?: string): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

