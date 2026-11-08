import { toCountry } from "@/lib/format";
import { stats, lastIndexLoad } from "@/lib/store";

export async function GET(req: Request) {
  const c = toCountry(new URL(req.url).searchParams.get("country")) ?? "IN";
  const t0 = Date.now();
  const body = await stats(c);
  const l = lastIndexLoad();
  return Response.json(body, { headers: { "x-index": `${l?.hit ? "hit" : "miss"} load=${l?.ms ?? 0}ms total=${Date.now() - t0}ms` } });
}
