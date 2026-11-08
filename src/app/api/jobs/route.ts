import { searchSchema, toProfile, toSearchOpts, searchOut } from "@/lib/format";
import { search } from "@/lib/store";

// GET /api/jobs?country=IN&years=3&open_to_relocation=false&show=both&min_salary=100000&function=engineering&q=backend&level=junior,mid&include_unclear=true&page=0&limit=20 (page starts at 0)
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = searchSchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "invalid parameters", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const p = toProfile(parsed.data);
  if ("error" in p) return Response.json({ error: p.error }, { status: 400 });
  const opts = toSearchOpts(parsed.data, 20);
  const r = await search(p, opts);
  return Response.json(searchOut(p, r, opts), { headers: { "cache-control": "no-store" } });
}
