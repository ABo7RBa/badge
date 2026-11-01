# V16.11 image sources

| Category | Provider | Integration |
| --- | --- | --- |
| boys / girls | Unsplash | Official search/photos API; Access Key via Client-ID; source-hosted banner + portrait thumbnail with photographer/photo credits and selection tracking |
| anime | Wallhaven | Official v1 API; SFW anime portrait + landscape from a shared search theme, original-image download and local pair QA/rendering |
| pc_wallpapers | Wallhaven | General category, SFW, original size >=1920×1080; preview and page link |
| movies | Fanart.tv | Official v3 movies endpoint, configured IMDb IDs; matching poster/background rendered locally |

Unsplash API: https://unsplash.com/documentation
Official SDK and API requirements: https://github.com/unsplash/unsplash-js
API guidelines: https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
License: https://unsplash.com/license
Fanart.tv: https://fanart.tv/api-docs/ — https://fanart.tv/get-an-api-key/
Wallhaven: https://wallhaven.cc/help/api

Unsplash uses returned images.unsplash.com URLs directly and retains query parameters such as ixid. It does not download, transform, cache or rehost Unsplash image bytes. Photographer/photo metadata and attribution links are retained. The requested image-only presentation hides attribution by default; SHOW_IMAGE_CREDITS=true displays photographer and Unsplash links with utm_source=abo7rb&utm_medium=referral. The Unsplash API guidelines require displayed attribution, which the image-only presentation does not fulfill. Chosen assets are tracked through their validated API download_location before publishing or opening download actions. Merely searching/prefetching/previewing candidates does not register downloads.

Search metadata is cached for one hour. A conservative shared45actual APIrequests/hour/key guard counts searches and tracking and observes provider rate-limit responses. Keys are not stored in cache JSON or exposed in errors. Boys style is selected through source descriptions/tags, monochrome search filters and average-color metadata, not local pixel processing or an AI pose classifier.

No bundled image library or owner-upload feature remains. The local composite renderer is used for newly fetched Wallhaven anime and Fanart.tv pairs. Film images remain subject to owners' rights, without claims of Netflix availability. 4K Wallpapers remains a collection-page link feature.

No active fetch routes remain for Pexels, Pixabay, Openverse, Wikimedia Commons or TMDB. Previously saved image files remain untouched for backup, but are never selected for publication or preview.

Direct Unsplash documentation access returned403 in this environment; integration requirements were reviewed from the official GitHub SDK. Live signup/key issuance and authenticated service access were not verified.

Every publication imports a new provider pair for each due post and never falls back to saved/bundled image packs. The legacy SOURCE_ONLY and ENABLE_SOURCE_CHANNELS flags no longer enable any library or upload path. Preview requests also fetch fresh results. Saved provider records/files support download buttons and duplicate history only. No live network or Discord-send guarantee is implied. Wallhaven full-image retrieval also requires w.wallhaven.cc. Attribution does not replace rights holders’ permissions.
