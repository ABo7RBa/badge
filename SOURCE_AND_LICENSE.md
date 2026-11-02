# Code and sources

This independent Discord.js bot uses Unsplash, Fanart.tv and Wallhaven APIs. It is not endorsed by those services or Discord. Source-specific documentation is in SOURCES.md.

Unsplash source records retain photographer/photo links and download tracking. Default PHOTO_DISPLAY=card fetches validated image URLs in memory and uploads a composite card to Discord; it does not retain a local photo library. Unsplash API guidelines require hotlinking and displayed attribution, which composite cards without credits do not fulfill. Set PHOTO_DISPLAY=source and SHOW_IMAGE_CREDITS=true to retain the original hotlinked display and photographer/Unsplash attribution. Credentials remain on the user's host.

Fanart.tv requires a project API key; film artwork rights remain with their owners. Wallhaven supplies PC previews/source links and SFW anime source pairs; image rights remain with their respective owners. No image library or sample photographs are distributed in this version.
