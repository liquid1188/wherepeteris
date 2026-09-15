<?php
/**
 * Plugin Name: WPI Static Front End
 * Description: Keeps the static wherepeteris.com in sync with this WordPress install. Rebuilds the site when a post is published or a comment is approved, and lets the comment form send readers back to the static site. Drop this file in wp-content/mu-plugins/ (create the folder if needed) and add define('WPI_DEPLOY_HOOK', 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...'); and define('WPI_STATIC_HOST', 'wherepeteris.com'); to wp-config.php.
 */

if (!defined('ABSPATH')) exit;

// 1. Let wp-comments-post.php redirect back to the static site after a comment is submitted.
add_filter('allowed_redirect_hosts', function ($hosts) {
    if (defined('WPI_STATIC_HOST')) $hosts[] = WPI_STATIC_HOST;
    return $hosts;
});

// 2. Trigger a rebuild. Debounced to one call per minute so a burst of edits is one build.
function wpi_static_rebuild() {
    if (!defined('WPI_DEPLOY_HOOK')) return;
    if (get_transient('wpi_static_rebuild_pending')) return;
    set_transient('wpi_static_rebuild_pending', 1, 60);
    wp_remote_post(WPI_DEPLOY_HOOK, ['timeout' => 5, 'blocking' => false]);
}
add_action('transition_post_status', function ($new, $old, $post) {
    if (in_array($post->post_type, ['post', 'page']) && ($new === 'publish' || $old === 'publish')) wpi_static_rebuild();
}, 10, 3);
add_action('transition_comment_status', function ($new, $old, $comment) {
    if ($new === 'approved' || $old === 'approved') wpi_static_rebuild();
}, 10, 3);
add_action('wp_insert_comment', function ($id, $comment) {
    if ($comment->comment_approved == 1) wpi_static_rebuild();
}, 10, 2);
add_action('edited_term', 'wpi_static_rebuild');
add_action('profile_update', 'wpi_static_rebuild');
