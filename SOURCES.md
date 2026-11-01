# V16.12 image sources

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

Every publication fetches provider images online for each due post and never falls back to saved/bundled image packs. The legacy SOURCE_ONLY and ENABLE_SOURCE_CHANNELS flags no longer enable any library or upload path. Preview requests also fetch fresh results. Saved provider records/files support download buttons and duplicate history only. No live network or Discord-send guarantee is implied. Wallhaven full-image retrieval also requires w.wallhaven.cc. Attribution does not replace rights holders’ permissions.

Fanart V16.12: api_key query authentication supplements the api-key header for interoperability. Query-bearing URLs and raw transport details are never logged by the source adapter. Movies use explicit pending/published states: manual fetches/previews and failed Discord sends do not consume artwork. A pending pair must be downloaded and validated from Fanart again before publishing; it is never sent offline from stored files. Published assets remain in duplicate history. Per-guild locking serializes movie publication and manual imports. Legacy records with known publication history remain published; only a known latest unused fetch is recovered as pending.

Movie searches scan up to10catalogue records and24image downloads per attempt, with3concurrent image downloads and bounded artwork windows. Later catalogue records and artwork remain reachable through rotating search progress. Unsuitable results and an incomplete search are distinguished. Avatar minimum320matches local normalization. These are local mocked-service regressions, not live service validation.

Visual duplicate checks against published records run during Fanart pair selection, allowing alternative artwork with different content to be tried when the service assigns new IDs to duplicate images. Artwork grid progress also keeps a successful tile reachable while its pair is pending online revalidation.
