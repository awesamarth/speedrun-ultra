#!/usr/bin/env bun
/**
 * Ingest engineering + product roles (list + full JD) from the speedrun talent API
 * into a local cache: internal/cache/{list.json, jobs/<id>.json}.
 *
 * - Always tags requests with ?source=speedrun-ultra
 * - Global throttle (~3 req/s), retry with exponential backoff on 5xx/429/network
 * - Incremental: only fetches details for ids not cached, or whose published_at changed
 *
 * Usage: bun scripts/ingest.ts [--fn engineering,product] [--rps 3] [--max-pages 200] [--force]
 */
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://speedrun-talent-network.com/api/v1";
const SOURCE = "speedrun-ultra";
const CACHE = join(import.meta.dir, "..", "internal", "cache");
const JOBS_DIR = join(CACHE, "jobs");

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const FNS = arg("fn", "engineering,product").split(",");
const RPS = Number(arg("rps", "2.5"));
const MAX_PAGES = Number(arg("max-pages", "200"));
const FORCE = args.includes("--force");

// ---------- throttled fetch with retry ----------
let nextSlot = 0;
async function throttle() {
  const gap = 1000 / RPS;
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait) await Bun.sleep(wait);
}

const stats = { requests: 0, retries: 0, failures: 0 };

async function getJson<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("source", SOURCE);
  for (let attempt = 0; attempt < 7; attempt++) {
    await throttle();
    stats.requests++;
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "speedrun-ultra/0.1 (+github.com/awesamarth)" } });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        const backoff = ra > 0 ? ra * 1000 : Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300;
        stats.retries++;
        await Bun.sleep(backoff);
        continue;
      }
      throw new Error(`HTTP ${res.status} ${url}`);
    } catch (e) {
      if (attempt === 6) throw e;
      stats.retries++;
      await Bun.sleep(Math.min(30_000, 500 * 2 ** attempt));
    }
  }
  stats.failures++;
  console.error(`giving up: ${url}`);
  return null;
}

// ---------- types (subset) ----------
type ListJob = { id: string; title: string; company: string; url: string; published_at: string | null; function: string | null };
type ListPage = { jobs: ListJob[]; total: number; page: number; total_pages: number };

// ---------- list ----------
async function fetchList(fn: string): Promise<ListJob[]> {
  const out: ListJob[] = [];
  let totalPages = 1;
  for (let page = 0; page < Math.min(totalPages, MAX_PAGES + 1); page++) {
    const r = await getJson<ListPage>("/jobs", { fn, sort: "new", page });
    if (!r) { console.error(`list ${fn} page ${page} failed; continuing`); continue; }
    totalPages = r.total_pages;
    out.push(...r.jobs);
    process.stdout.write(`\rlist ${fn}: page ${page + 1}/${totalPages} (${out.length}/${r.total})   `);
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  await mkdir(JOBS_DIR, { recursive: true });
  const t0 = Date.now();

  const seen = new Map<string, ListJob>();
  for (const fn of FNS) for (const j of await fetchList(fn)) seen.set(j.id, j);
  const list = [...seen.values()];
  await Bun.write(join(CACHE, "list.json"), JSON.stringify({ fetched_at: new Date().toISOString(), fns: FNS, jobs: list }));
  console.log(`list: ${list.length} unique jobs`);

  // decide which details to fetch
  const todo: ListJob[] = [];
  for (const j of list) {
    const p = join(JOBS_DIR, `${j.id}.json`);
    if (FORCE || !existsSync(p)) { todo.push(j); continue; }
    const cached = await Bun.file(p).json().catch(() => null);
    if (!cached || cached.published_at !== j.published_at || cached.description_text == null) todo.push(j);
  }
  console.log(`details to fetch: ${todo.length} (cached: ${list.length - todo.length})`);

  // fetch details with small concurrency; throttle is global
  let done = 0, missing = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        const d = await getJson<{ job?: Record<string, unknown> }>(`/jobs/${j.id}`);
        const job = d?.job ?? (d as Record<string, unknown> | null);
        if (job) await Bun.write(join(JOBS_DIR, `${j.id}.json`), JSON.stringify({ ...job, _fetched_at: new Date().toISOString() }));
        else missing++;
      } catch (e) {
        stats.failures++;
        console.error(`\ndetail ${j.id} failed: ${(e as Error).message}`);
      }
      done++;
      if (done % 10 === 0 || done === todo.length)
        process.stdout.write(`\rdetails: ${done}/${todo.length}  req=${stats.requests} retries=${stats.retries} fail=${stats.failures}   `);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  process.stdout.write("\n");

  // ids in cache that are no longer listed => likely closed
  const listed = new Set(list.map((j) => j.id));
  const glob = new Bun.Glob("*.json");
  const stale: string[] = [];
  for await (const f of glob.scan(JOBS_DIR)) { const id = f.replace(/\.json$/, ""); if (!listed.has(id)) stale.push(id); }
  await Bun.write(join(CACHE, "stale.json"), JSON.stringify(stale));

  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s · fetched ${todo.length - missing} · 404 ${missing} · stale ${stale.length} · ${JSON.stringify(stats)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
