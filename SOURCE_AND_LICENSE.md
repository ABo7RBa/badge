# Code and sources

This independent Discord.js bot uses Unsplash, Fanart.tv and Wallhaven APIs. It is not endorsed by those services or Discord. Source-specific documentation is in SOURCES.md.

Unsplash images are hotlinked from API-provided URLs, with photographer/photo links and referral attribution. Selected use/download actions trigger the source's validated download tracking endpoint. The bot does not rehost Unsplash images or render them into local composite cards. Access Key credentials remain on the user's host.

Fanart.tv requires a project API key; film artwork rights remain with their owners. Wallhaven is used for previews and original source links. Bundled media and user-provided assets may have separate use restrictions.

The opt-in own-profile adapter retains the historical acknowledgment of Nekros-dsc/Pfp-Bot in src/member-source.js. Only the command caller's own profile is fetched by that adapter.
