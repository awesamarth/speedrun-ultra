// Serves public/demo.mp4 with HTTP Range support (206). Workers static assets ignore Range,
// and Safari/iOS won't play video without it. The file (~23MB) is read once per isolate and sliced.
import { getCloudflareContext } from "@opennextjs/cloudflare";

const SRC = "/demo.mp4";
const G = globalThis as unknown as { __su_video?: Promise<Uint8Array<ArrayBuffer> | null> };

async function load(req: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const url = new URL(SRC, req.url);
  let r: Response | null = null;
  try {
    const { env } = await getCloudflareContext({ async: true });
    r = env.ASSETS ? await env.ASSETS.fetch(url) : null;
  } catch { /* next dev: no real assets binding */ }
  if (!r?.ok) r = await fetch(url);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

export async function GET(req: Request) {
  G.__su_video ??= load(req).then((b) => { if (!b) G.__su_video = undefined; return b; });
  const buf = await G.__su_video;
  if (!buf) return new Response("not found", { status: 404 });
  const size = buf.length;
  const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
  const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return new Response(buf, { headers: { ...base, "content-length": String(size) } });

  let start: number, end: number;
  if (!m[1]) { start = Math.max(size - Number(m[2]), 0); end = size - 1; } // bytes=-N
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
  return new Response(buf.subarray(start, end + 1), {
    status: 206,
    headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
  });
}
