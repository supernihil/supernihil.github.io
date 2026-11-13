// Cookieless page-view counter in a SQLite-backed Durable Object.
import { DurableObject } from "cloudflare:workers";

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (
      day TEXT NOT NULL, path TEXT NOT NULL, ref TEXT, country TEXT, device TEXT, lang TEXT, visitor TEXT
    ); CREATE INDEX IF NOT EXISTS hits_day ON hits(day);`);
  }

  hit(h) {
    this.sql.exec("INSERT INTO hits VALUES (?,?,?,?,?,?,?)", h.day, h.path, h.ref, h.country, h.device, h.lang, h.visitor);
  }

  report(days = 30) {
    const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const q = (s) => this.sql.exec(s, since).toArray();
    return {
      since,
      days: q("SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM hits WHERE day >= ? GROUP BY day ORDER BY day"),
      totals: q("SELECT COUNT(*) views, COUNT(DISTINCT day || visitor) visitors FROM hits WHERE day >= ?")[0],
      paths: q("SELECT path k, COUNT(*) n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 25"),
      refs: q("SELECT ref k, COUNT(*) n FROM hits WHERE day >= ? AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 15"),
      countries: q("SELECT country k, COUNT(*) n FROM hits WHERE day >= ? GROUP BY country ORDER BY n DESC LIMIT 15"),
      devices: q("SELECT device k, COUNT(*) n FROM hits WHERE day >= ? GROUP BY device ORDER BY n DESC"),
    };
  }
}
