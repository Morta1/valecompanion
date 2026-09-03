import path from "node:path";

const root = import.meta.dir;
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const resolved = path.resolve(root, requested);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== path.join(root, "index.html")) {
      return new Response("Not found", { status: 404 });
    }
    const file = Bun.file(resolved);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: {
        "cache-control": "no-store",
        "content-type": contentTypes[path.extname(resolved)] ?? "application/octet-stream",
      },
    });
  },
});

console.log(`ValeCompanion UX prototype: http://127.0.0.1:${server.port}`);
