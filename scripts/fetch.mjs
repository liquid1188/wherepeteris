// Pulls everything public from the WordPress REST API into src/_data/wp/.
// WordPress stays the CMS. This runs before every build.
import { mkdir, writeFile } from "node:fs/promises";

const WP = process.env.WP_ORIGIN || "https://wherepeteris.com";
const OUT = "src/_data/wp";
const UA = "Mozilla/5.0 (compatible; wpi-static-build)";
await mkdir(OUT, { recursive: true });

async function getJSON(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, { headers: { "user-agent": UA } });
    if (r.ok) return { data: await r.json(), total: Number(r.headers.get("x-wp-totalpages") || 1) };
    if (r.status === 400) return { data: [], total: 0 };
    await new Promise(res => setTimeout(res, 1500 * attempt));
  }
  throw new Error("Failed: " + url);
}

async function all(type, params = "") {
  const first = await getJSON(`${WP}/wp-json/wp/v2/${type}?per_page=100&page=1${params}`);
  const items = [...first.data];
  const queue = [];
  for (let p = 2; p <= first.total; p++) queue.push(p);
  while (queue.length) {
    const batch = queue.splice(0, 4);
    const results = await Promise.all(batch.map(p => getJSON(`${WP}/wp-json/wp/v2/${type}?per_page=100&page=${p}${params}`)));
    for (const r of results) items.push(...r.data);
    process.stdout.write(`\r${type}: ${items.length}   `);
  }
  console.log(`\r${type}: ${items.length} total`);
  return items;
}

const FIELDS = "&_fields=id,date,modified,slug,link,title,content,excerpt,author,featured_media,comment_status,sticky,categories,tags,parent,menu_order,_links,_embedded";

const [posts, pages, categories, tags, comments] = await Promise.all([
  all("posts", "&_embed=author,wp:featuredmedia" + FIELDS),
  all("pages", "&_embed=author,wp:featuredmedia" + FIELDS),
  all("categories", "&_fields=id,name,slug,description,parent,count"),
  all("tags", "&_fields=id,name,slug,description,count"),
  all("comments", "&_fields=id,post,parent,author_name,author_url,author_avatar_urls,date,content,status"),
]);

const authors = {};
for (const p of [...posts, ...pages]) {
  const a = p._embedded?.author?.[0];
  if (a && a.id && !authors[a.id]) {
    authors[a.id] = { id: a.id, name: a.name, slug: a.slug, description: a.description || "", url: a.url || "", avatar: a.avatar_urls?.["96"] || "" };
  }
}

function slim(p) {
  const fm = p._embedded?.["wp:featuredmedia"]?.[0];
  return {
    id: p.id, date: p.date, modified: p.modified, slug: p.slug, link: p.link,
    title: p.title?.rendered || "", content: p.content?.rendered || "", excerpt: p.excerpt?.rendered || "",
    author: p.author, sticky: !!p.sticky, comment_status: p.comment_status,
    categories: p.categories || [], tags: p.tags || [], parent: p.parent || 0, menu_order: p.menu_order || 0,
    image: fm?.source_url ? { src: fm.source_url, alt: fm.alt_text || "", width: fm.media_details?.width, height: fm.media_details?.height,
      sizes: fm.media_details?.sizes ? Object.fromEntries(Object.entries(fm.media_details.sizes).map(([k, v]) => [k, v.source_url])) : {} } : null,
  };
}

await writeFile(`${OUT}/posts.json`, JSON.stringify(posts.map(slim)));
await writeFile(`${OUT}/pages.json`, JSON.stringify(pages.map(slim)));
await writeFile(`${OUT}/categories.json`, JSON.stringify(categories));
await writeFile(`${OUT}/tags.json`, JSON.stringify(tags));
await writeFile(`${OUT}/comments.json`, JSON.stringify(comments.filter(c => c.status === "approved").map(c => ({
  id: c.id, post: c.post, parent: c.parent, author: c.author_name, url: c.author_url,
  avatar: c.author_avatar_urls?.["48"] || "", date: c.date, content: c.content?.rendered || "" }))));
await writeFile(`${OUT}/authors.json`, JSON.stringify(Object.values(authors)));
await writeFile(`${OUT}/meta.json`, JSON.stringify({ fetched: new Date().toISOString(), origin: WP }));
console.log("done");
