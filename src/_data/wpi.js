// Turns the raw WordPress export in ./wp/ into everything the templates need.
import { readFileSync } from "node:fs";
import site from "./site.json" with { type: "json" };
import collectionDefs from "./readingLists.json" with { type: "json" };
import popes from "./popes.json" with { type: "json" };
import popular from "./popular.json" with { type: "json" };

const read = f => JSON.parse(readFileSync(new URL(`./wp/${f}.json`, import.meta.url), "utf8"));
const rawPosts = read("posts"), rawPages = read("pages"), categories = read("categories"),
      tags = read("tags"), comments = read("comments"), authors = read("authors");

const origin = "https://wherepeteris.com";
const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", eacute: "é", ntilde: "ñ", ouml: "ö", uuml: "ü", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", copy: "©" };
const decode = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
const strip = s => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// Rewrite content so it works on the static domain: internal links go root-relative,
// media stays on the WordPress origin (configurable in site.json), images lazy-load.
function clean(html) {
  return html
    .replace(new RegExp(`(href=["'])${origin}/(?!wp-content|wp-json|wp-admin|wp-login|wp-comments)`, "g"), "$1/")
    .replace(new RegExp(`${origin}/wp-content/`, "g"), `${site.media}/wp-content/`)
    .replace(/<img(?![^>]*loading=)/g, '<img loading="lazy" decoding="async"')
    .replace(/<iframe(?![^>]*loading=)/g, '<iframe loading="lazy"');
}
function words(html) { return strip(html).split(" ").length; }

const byId = arr => Object.fromEntries(arr.map(x => [x.id, x]));
const catsById = byId(categories), tagsById = byId(tags), authorsById = byId(authors);

function catPath(c) { // WordPress nests category URLs under parents
  const parts = []; let cur = c;
  while (cur) { parts.unshift(cur.slug); cur = cur.parent ? catsById[cur.parent] : null; }
  return `/category/${parts.join("/")}/`;
}
for (const c of categories) c.url = catPath(c);
for (const t of tags) t.url = `/tag/${t.slug}/`;
for (const a of authors) a.url = `/author/${a.slug}/`;

// Comments threaded per post
const commentsByPost = {};
const cById = byId(comments);
for (const c of comments) { c.replies = []; }
for (const c of comments) {
  if (c.parent && cById[c.parent]) cById[c.parent].replies.push(c);
  else (commentsByPost[c.post] ||= []).push(c);
}
const sortThread = list => { list.sort((a, b) => a.date.localeCompare(b.date)); list.forEach(c => sortThread(c.replies)); };
for (const k in commentsByPost) sortThread(commentsByPost[k]);
const countThread = list => list.reduce((n, c) => n + 1 + countThread(c.replies), 0);

function decorate(p) {
  p.title = strip(p.title);
  p.content = clean(p.content);
  p.summary = strip(p.excerpt).replace(/\s*(\[…\]|Continue reading.*)$/i, "").trim();
  if (p.summary.length > 220) p.summary = p.summary.slice(0, 217).replace(/\s\S*$/, "") + "…";
  p.url = new URL(p.link).pathname;
  p.authorObj = authorsById[p.author] || { name: "Where Peter Is", slug: "wpi", url: "/contributors/", avatar: "" };
  p.cats = (p.categories || []).map(id => catsById[id]).filter(Boolean).filter(c => c.slug !== "uncategorized");
  p.tagObjs = (p.tags || []).map(id => tagsById[id]).filter(Boolean);
  p.primaryCat = p.cats[0] || null;
  p.readMinutes = Math.max(1, Math.round(words(p.content) / 230));
  p.dateObj = new Date(p.date);
  p.comments = commentsByPost[p.id] || [];
  p.commentCount = countThread(p.comments);
  p.titleText = p.title.toLowerCase();
  p.taxText = (p.tagObjs.map(t => t.name).join(" | ") + " | " + p.cats.map(c => c.name).join(" | ")).toLowerCase();
  p.bodyText = strip(p.content).toLowerCase();
  p.wordCount = p.bodyText.split(" ").length;
  return p;
}

const posts = rawPosts.map(decorate).sort((a, b) => b.date.localeCompare(a.date));
const dynamicPages = new Set(["donate","donation-failed-2","donor-dashboard","donation-confirmation-2","contributors","contributors-2","contributors-3","home"]);
const pages = rawPages.filter(p => !dynamicPages.has(p.slug)).map(decorate);
const pagesById = byId(pages);
for (const pg of pages) { // nested page URLs come straight from WordPress's link, which already includes the parent path
  pg.children = pages.filter(x => x.parent === pg.id).sort((a, b) => a.menu_order - b.menu_order || a.title.localeCompare(b.title));
}

// Per-author and per-term post lists, paginated the way WordPress does it.
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; };
function listing(kind, item, items, base) {
  return chunk(items, site.perPage).map((slice, i, all) => ({
    kind, item, posts: slice, page: i + 1, pages: all.length, total: items.length,
    url: i === 0 ? base : `${base}page/${i + 1}/`,
    prev: i > 0 ? (i === 1 ? base : `${base}page/${i}/`) : null,
    next: i < all.length - 1 ? `${base}page/${i + 2}/` : null,
  }));
}
const homePages = listing("home", null, posts, "/");
const authorPages = [], categoryPages = [], tagPages = [];
for (const a of authors) { a.posts = posts.filter(p => p.author === a.id); a.count = a.posts.length; if (a.count) authorPages.push(...listing("author", a, a.posts, a.url)); }
for (const c of categories) { c.posts = posts.filter(p => p.categories.includes(c.id)); if (c.posts.length) categoryPages.push(...listing("category", c, c.posts, c.url)); }
for (const t of tags) { t.posts = posts.filter(p => p.tags.includes(t.id)); if (t.posts.length) tagPages.push(...listing("tag", t, t.posts, t.url)); }

const topCategories = categories.filter(c => c.posts.length >= 3 && c.slug !== "uncategorized").sort((a, b) => b.posts.length - a.posts.length);
const contributors = authors.filter(a => a.count > 0).sort((a, b) => b.count - a.count);
const people = contributors.filter(a => a.slug !== "wpi-contributor");

// Curated collections. An article is in a collection when a match phrase appears in its
// title, tags, or categories (strong), or at least three times in the body (weak).
function score(p, def) {
  // Title match dominates, then tags/categories, then body density. Returns 0 when not a member.
  let title = 0, tax = 0, body = 0;
  if (def.cat && p.cats.some(c => c.slug === def.cat)) tax += 3;
  for (const m of def.match || []) {
    if (p.titleText.includes(m)) title += 1;
    if (p.taxText.includes(m)) tax += 1;
    let n = 0, i = -1; while ((i = p.bodyText.indexOf(m, i + 1)) !== -1 && n < 12) n++;
    body += n;
  }
  const density = body / Math.max(1, p.wordCount / 1000); // mentions per thousand words
  if (!title && !tax && (body < 4 || density < 2)) return 0;
  return title * 1000 + tax * 100 + Math.min(body, 12) * 5 + Math.min(density, 20);
}
function rank(defs) {
  return posts.map(p => ({ p, sc: score(p, defs) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc || b.p.date.localeCompare(a.p.date)).map(x => x.p);
}
const collections = collectionDefs.map(def => {
  const items = rank(def);
  const cover = items.find(p => p.image && p.image.width >= 600)?.image || null;
  return { ...def, url: `/collections/${def.slug}/`, posts: items, count: items.length, cover };
}).filter(c => c.count >= 3);
const collectionPages = collections.flatMap(c => listing("collection", c, c.posts, c.url));
for (const pope of popes) {
  const def = { match: pope.match };
  pope.url = `/popes/${pope.slug}/`;
  pope.posts = rank(def);
  pope.count = pope.posts.length;
}
const popePages = popes.flatMap(pope => listing("pope", pope, pope.posts, pope.url));
const postsByUrl = Object.fromEntries(posts.map(p => [p.url, p]));
const popularPosts = (popular.items || []).map(u => postsByUrl[u]).filter(Boolean);
const mostCommented = [...posts].sort((a, b) => b.commentCount - a.commentCount).slice(0, 8);

const years = {};
for (const p of posts) (years[p.dateObj.getUTCFullYear()] ||= []).push(p);

export default {
  posts, pages, pagesById, people, collections, collectionPages, popes, popePages, popularPosts: popularPosts.length ? popularPosts : mostCommented.slice(0, 6), mostCommented, categories, tags, authors, contributors, topCategories,
  homePages, authorPages, categoryPages, tagPages, years,
  totals: { posts: posts.length, comments: comments.length, authors: contributors.length },
  postsById: byId(posts),
};
