# Where Peter Is, static front end

WordPress stays the CMS. This repo builds the public site from the WordPress REST API and serves it from Cloudflare Pages. Editors keep writing, moderating comments, and running donations in WordPress exactly as before.

## How it works

1. `scripts/fetch.mjs` pulls every post, page, category, tag, author, and approved comment from `WP_ORIGIN` (default `https://wherepeteris.com`) into `src/_data/wp/`.
2. Eleventy builds the site into `_site/` using the same URLs WordPress uses, so no links break.
3. Pagefind indexes the build for site search.
4. `wordpress/wpi-static.php` (a must-use plugin) asks Cloudflare to rebuild when a post is published or a comment is approved. `.github/workflows/rebuild.yml` rebuilds every six hours as a safety net.

Comments post straight to WordPress's own `wp-comments-post.php`, so Akismet, moderation, and the comment history all stay put. A new comment shows on the static site after the next build (about two minutes).

## Local

    npm install
    npm run build        # fetch + eleventy + pagefind
    npm run serve        # dev server (run npm run fetch once first)

## Go live

1. **Cloudflare Pages**: create a project from this repo. Build command `npm run build`, output directory `_site`, Node 20 or newer. Add a deploy hook (Settings, Builds) and copy its URL.
2. **GitHub**: add the hook URL as the `CF_DEPLOY_HOOK` repository secret.
3. **WordPress**: copy `wordpress/wpi-static.php` to `wp-content/mu-plugins/`. In `wp-config.php` add
   `define('WPI_DEPLOY_HOOK', '<hook url>');` and `define('WPI_STATIC_HOST', 'wherepeteris.com');`
4. **Analytics**: put the GA4 measurement ID in `src/_data/site.json` (`ga`). The Facebook pixel can be added to `src/_includes/base.njk` the same way.
5. **Cutover**: move WordPress to `edit.wherepeteris.com` (or any subdomain), set `wp` and `media` in `site.json` to that origin, set `WP_ORIGIN` as a Cloudflare build environment variable, then point `wherepeteris.com` at the Pages project. Media keeps serving from WordPress; nothing needs re-uploading.

## What lives where

- `src/_data/site.json`: name, nav, footer links, social, GA id, WordPress origin.
- `src/_data/wpi.js`: turns the raw export into sorted posts, threaded comments, paginated listings, author and topic indexes.
- `src/*.njk`: one template per page type (home, post, page, author, category, tag, topics, contributors, archive, search, feed, sitemap, 404).
- `src/css/site.css`: all styling. Tokens at the top.
- `src/static/_redirects`: old WordPress URL shapes (feeds, `?s=` search, donate pages) routed to the right place.

## Known gaps

- The REST API does not expose Molongui guest authors, so articles by guest authors show the WordPress account that posted them. Fix on the WordPress side by giving guest authors real user accounts, or by exposing the Molongui field to the REST API.
- GiveWP donation pages and the donor dashboard stay on WordPress; `/donate/` redirects there.
- SearchWP, WP Rocket, Sucuri, SocialSnap, and MailOptin are no longer needed for the public site once it is static.
