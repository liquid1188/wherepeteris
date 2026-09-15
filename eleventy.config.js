import { HtmlBasePlugin } from "@11ty/eleventy";

export default function (cfg) {
  cfg.addPlugin(HtmlBasePlugin); // rewrites root-relative URLs when PATH_PREFIX is set (preview builds)
  cfg.addPassthroughCopy({ "src/css": "css", "src/static": "/", "src/wp": "wp" });
  cfg.addFilter("date", (d, fmt = "long") => {
    const dt = d instanceof Date ? d : new Date(d);
    if (fmt === "iso") return dt.toISOString();
    if (fmt === "short") return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  });
  cfg.addFilter("head", (arr, n) => (arr || []).slice(0, n));
  cfg.addFilter("skip", (arr, n) => (arr || []).slice(n));
  cfg.addFilter("without", (arr, p) => (arr || []).filter(x => x.id !== p.id));
  cfg.addFilter("striptags", s => String(s || "").replace(/<[^>]+>/g, ""));
  cfg.addFilter("img", (image, size) => image ? (image.sizes?.[size] || image.src) : "");
  cfg.addFilter("attr", s => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"));
  cfg.addGlobalData("year", () => new Date().getUTCFullYear());
  cfg.setQuietMode(true);
  return { pathPrefix: process.env.PATH_PREFIX || "/", dir: { input: "src", output: "_site", includes: "_includes", data: "_data" }, htmlTemplateEngine: "njk", markdownTemplateEngine: "njk" };
}
