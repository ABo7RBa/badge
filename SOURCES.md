# V16.13 image sources

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

The default PHOTO_DISPLAY=card renders Unsplash boys/girls with the same composite profile-card template as anime. Validated API image URLs are requested exactly, including ixid, without an API Authorization header and without redirects. Images are bounded to8MiB per response and40million decoded pixels, composited in memory, and uploaded to Discord as onePNG. Original image bytes are never written into a local library. Saved Unsplash records remain URL/source metadata.

PHOTO_DISPLAY=source retains original hotlinked banner/thumbnail presentation and does not download or rehost Unsplash images. Unsplash API requirements include hotlinking and displayed photographer/Unsplash attribution; the requested composite-card mode does not fulfill hotlinking. Use PHOTO_DISPLAY=source and SHOW_IMAGE_CREDITS=true to retain both requirements. Photographer/source metadata and attribution URLs remain available in either mode. Selected publication/download actions are tracked with the validated API download_location; searches and previews do not register tracking requests.

Search metadata is cached for one hour. A conservative shared45actual APIrequests/hour/key guard counts searches and tracking and observes provider rate-limit responses. Keys are not stored in cache JSON or exposed in errors. Boys style is selected through source descriptions/tags, monochrome search filters and average-color metadata, not local pixel processing or an AI pose classifier.

No bundled image library or owner-upload feature remains. The local composite renderer is used for newly fetched Wallhaven anime and Fanart.tv pairs. Film images remain subject to owners' rights, without claims of Netflix availability. 4K Wallpapers remains a collection-page link feature.

No active fetch routes remain for Pexels, Pixabay, Openverse, Wikimedia Commons or TMDB. Previously saved image files remain untouched for backup, but are never selected for publication or preview.

Direct Unsplash documentation access returned403 in this environment; integration requirements were reviewed from the official GitHub SDK. Live signup/key issuance and authenticated service access were not verified.

Every publication fetches provider images online for each due post and never falls back to saved/bundled image packs. The legacy SOURCE_ONLY and ENABLE_SOURCE_CHANNELS flags no longer enable any library or upload path. Preview requests also fetch fresh results. Saved provider records/files support download buttons and duplicate history only. No live network or Discord-send guarantee is implied. Wallhaven full-image retrieval also requires w.wallhaven.cc. Attribution does not replace rights holders’ permissions.

Fanart V16.12: api_key query authentication supplements the api-key header for interoperability. Query-bearing URLs and raw transport details are never logged by the source adapter. Movies use explicit pending/published states: manual fetches/previews and failed Discord sends do not consume artwork. A pending pair must be downloaded and validated from Fanart again before publishing; it is never sent offline from stored files. Published assets remain in duplicate history. Per-guild locking serializes movie publication and manual imports. Legacy records with known publication history remain published; only a known latest unused fetch is recovered as pending.

Movie searches scan up to10catalogue records and24image downloads per attempt, with3concurrent image downloads and bounded artwork windows. Later catalogue records and artwork remain reachable through rotating search progress. Unsuitable results and an incomplete search are distinguished. Avatar minimum320matches local normalization. These are local mocked-service regressions, not live service validation.

Visual duplicate checks against published records run during Fanart pair selection, allowing alternative artwork with different content to be tried when the service assigns new IDs to duplicate images. Artwork grid progress also keeps a successful tile reachable while its pair is pending online revalidation.

V16.13 card delivery: AttachFiles is checked before fetching a pair. Rendering completes before usage tracking, and room binding/revision is checked after each asynchronous stage. Failed/cancelled new photo-card publications and failed previews roll back only their new unposted metadata so the source pair can be retried online. Earlier records and published duplicate history remain intact. Per-category locks serialize rendering/publication against new imports; no failed card silently falls back to stored pictures or source-view embeds.
