import { skillMd, originOf } from "@/lib/docs";

export async function GET(req: Request) {
  return new Response(skillMd(originOf(req)), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" } });
}
