# Podcast episodes and RSS import

## Product decision

Podcast catalog browsing and listening do **not** require an account.
RSS import does **not** consume credits and does not involve PodTest+ checkout.
**PodTest+ remains “yakında.”**

## Feed configuration

- Admin-only: save feed URL, preview, import, refresh (`/yonetim` → “RSS’ten içe aktar”).
- Default prefill when no config exists: `https://anchor.fm/s/fc208fd0/podcast/rss`.
- Saving a URL is explicit. Preview/import with the prefilled default does **not** overwrite a stored configuration unless the admin clicks “Adresi kaydet”.
- Public pages never fetch the RSS feed; they read persisted `podcast_episode` rows only.

## Identity

| Rule | Behavior |
|---|---|
| Primary identity | Item `<guid>` within a feed config |
| Fallback | Enclosure `url` when GUID is missing |
| Ambiguous | No GUID and no enclosure → skip with explanation |
| Uniqueness | `@@unique([feedConfigId, rssGuid])` + advisory lock during import |
| Manual match | Exact `audioUrl` or `listeningUrl` only — **never title-only merge** |
| Conflicts | Shown in preview for admin `link` / `skip` resolution |

## Field mapping (Anchor / Spotify for Podcasters RSS)

| RSS | Stored field |
|---|---|
| channel title | `series` (and feed title on config) |
| item title | `title` |
| description / content:encoded | `description` (plain) + `descriptionHtml` (strict allowlist) |
| pubDate | `publicationDate` |
| itunes:image / enclosure art | `artworkUrl` |
| itunes:duration | `durationSeconds` |
| itunes:episode / season | `episodeNumber` / `seasonNumber` |
| enclosure url | `audioUrl` (HTTPS, SSRF-checked) |
| item link | `listeningUrl` (often podcasters.spotify.com — **not** treated as Spotify episode button) |
| open.spotify.com/episode/… | `spotifyEpisodeUrl` — admin-only; never invented |

Feed owner email (`itunes:email`) is **not** imported into public UI.

## Overrides and refresh

- Admin edits set keys in `manualOverrides`. Refresh/import does not overwrite those fields.
- Import confirmation may publish **new** items as `PUBLISHED` (stated in preview).
- `REMOVED` / non-published episodes are **never** auto-republished.
- Items missing from a later feed are **not** deleted or unpublished.
- Audio files are never downloaded or stored locally.

## Security

- HTTPS-only fetch with DNS/private-IP blocking, redirect hop revalidation, timeouts, size and item limits.
- XML parsed with `fast-xml-parser` (no DTD/external entity resolution). Feeds with `<!DOCTYPE` + `<!ENTITY` are rejected.
- Descriptions sanitized; unsafe URLs stripped.

## Public routes

| Route | Behavior |
|---|---|
| `/` | Latest 6 published episodes + “Tüm bölümler” |
| `/bolumler` | Newest first, pagination, title search |
| `/bolumler/[slug]` | Detail, sanitized HTML, `<audio preload="none">`, optional Spotify button |

## APIs

| Path | Notes |
|---|---|
| `GET/POST /api/admin/podcast-rss` | Admin config, preview, import, refresh, Spotify URL |
| `GET /api/bolumler` | Public catalog JSON (persisted data) |

## Setup

```bash
npm run db:migrate:deploy
# Admin UI: /yonetim → RSS’ten içe aktar → Önizle → RSS’ten içe aktar
```
