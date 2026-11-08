import { toProfile, jobOut, profileShape } from "@/lib/format";
import { getJob } from "@/lib/store";
import { z } from "zod";

const profileQuery = z.object({ ...profileShape, country: profileShape.country.optional() });

// GET /api/jobs/{id | 8-char prefix}?country=IN&years=3
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const j = await getJob(decodeURIComponent(id));
  if (!j) return Response.json({ error: "not found" }, { status: 404 });
  const q = profileQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  let profile;
  if (q.success && q.data.country) { const p = toProfile({ ...q.data, country: q.data.country }); if ("error" in p) return Response.json(p, { status: 400 }); profile = p; }
  return Response.json(jobOut(j, profile));
}
