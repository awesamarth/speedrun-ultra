import { llmsTxt, originOf } from "@/lib/docs";

export async function GET(req: Request) {
  return new Response(llmsTxt(originOf(req)), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
