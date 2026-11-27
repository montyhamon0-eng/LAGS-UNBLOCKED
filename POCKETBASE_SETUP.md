# LAGS UNBLOCKED - PocketBase Backend Setup Guide

This document explains how to deploy PocketBase, configure the database collections, and connect the LAGS UNBLOCKED frontend to it.

## Architecture Overview

```
┌─────────────────┐         HTTPS REST API         ┌──────────────────┐
│  GitHub Pages   │ ─────────────────────────────► │  PocketBase      │
│  (frontend)     │                                │  (backend)         │
│  HTML/JS/CSS    │  ◄──────────────────────────── │  SQLite + File   │
└─────────────────┘                                │  Storage           │
                                                   └──────────────────┘
```

- **Frontend**: Hosted on GitHub Pages (static HTML/JS/CSS).
- **Backend**: PocketBase hosted separately (Railway, Render, DigitalOcean App Platform, VPS, etc.).
- **Communication**: Browser → PocketBase REST API over HTTPS.
- **No secrets in frontend**: Admin credentials and API keys never appear in client-side code.

## 1. Deploying PocketBase

PocketBase cannot run on GitHub Pages (it's a Go server). Host it separately.

### Recommended hosting options
- **Railway** (railway.app) - one-click PocketBase deployment
- **Render** (render.com) - web service
- **DigitalOcean App Platform**
- **VPS / dedicated server** (Docker or standalone binary)

### Quick deploy (Railway example)
1. Create a PocketBase Docker service or use the official PocketBase template.
2. Set environment variable `PB_URL` or just use the provided HTTPS URL.
3. Ensure **HTTPS is enabled** (required for production; browsers block mixed content).
4. Note the public URL, e.g. `https://lags-pb.example.com`.

### Local development
```bash
./pocketbase serve
# Then set LAGS_CONFIG.POCKETBASE_URL = 'http://127.0.0.1:8090'
```

## 2. Connecting the Frontend to PocketBase

Edit `/assets/js/config.js`:

```javascript
const LAGS_CONFIG = {
  POCKETBASE_URL: 'https://your-pocketbase-domain.com',  // <-- your HTTPS URL
  ...
};
```

- Set `POCKETBASE_URL` to your live PocketBase HTTPS URL.
- Leave it empty `''` if you want social features to gracefully disable (site still works without backend).
- **Never** put admin credentials, passwords, or API keys in this file.

## 3. Database Collections to Create

Log into your PocketBase Admin UI (`https://your-domain.com/_/`), create an admin account, then create these collections.

### 3.1 Users (Auth collection)
Use PocketBase's built-in `users` collection. Add these extra fields:

| Field | Type | Notes |
|-------|------|-------|
| `display_name` | Text | User's display name |
| `biography` | Text | User bio |
| `avatar` | File | Profile picture |

### 3.2 Follows
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `follower` | Relation → users | Yes | Who follows |
| `following` | Relation → users | Yes | Who is followed |
| `created_at` | Date | Auto | When created |

**Constraints:** Unique combination of `follower` + `following` (prevents duplicate follows).

### 3.3 GameVotes
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `user` | Relation → users | Yes | Voter |
| `game_id` | Text | Yes | Game id from games.json |
| `created_at` | Date | Auto | When voted |

**Constraints:** Unique combination of `user` + `game_id` (one vote per user per game).

### 3.4 Collections
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `user` | Relation → users | Yes | Owner |
| `name` | Text | Yes | Collection name |
| `visibility` | Text | Yes | `public` or `private` |
| `created_at` | Date | Auto | When created |

### 3.5 CollectionGames
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `collection` | Relation → collections | Yes | Which collection |
| `game_id` | Text | Yes | Game id |
| `added_at` | Date | Auto | When added |

### 3.6 Reports
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `reporter` | Relation → users | Yes | Who reports |
| `reported_user` | Relation → users | Yes | Who is reported |
| `reason` | Text | Yes | Report reason |
| `created_at` | Date | Auto | When reported |

## 4. Collection Permissions (Access Rules)

In PocketBase Admin UI, edit each collection's **Access rules** (Users tab). Rule syntax examples:

### Users
- **Create**: `true` (allow registration)
- **Read**: `true` (public profiles readable)
- **Update**: `request.id = @collection.id` (users edit only themselves)
- **Delete**: `request.id = @collection.id`

### Follows
- **Create**: `request.auth !== "" && @collection.follower = request.id` (only self, logged-in)
- **Read**: `true`
- **Update**: `false`
- **Delete**: `request.auth !== "" && @collection.follower = request.id`

### GameVotes
- **Create**: `request.auth !== "" && @collection.user = request.id`
- **Read**: `true`
- **Update**: `false`
- **Delete**: `request.auth !== "" && @collection.user = request.id`

### Collections
- **Create**: `request.auth !== "" && @collection.user = request.id`
- **Read**: `true` (public visible; private filtered in app)
- **Update**: `request.auth !== "" && @collection.user = request.id`
- **Delete**: `request.auth !== "" && @collection.user = request.id`

### CollectionGames
- **Create**: `request.auth !== ""` (logged-in users can add to their own collections; enforce ownership in app logic)
- **Read**: `true`
- **Update**: `false`
- **Delete**: `request.auth !== ""` (ownership enforced in app logic)

### Reports
- **Create**: `request.auth !== ""`
- **Read**: `false` (only admins)
- **Update**: `false`
- **Delete**: `false`

## 5. Admin Credentials Security

- Create your PocketBase admin account via the Admin UI at first launch.
- **Never** hardcode the admin email/password in `config.js`, `auth.js`, or any frontend file.
- The frontend only uses **user-level** authentication (username/password via `auth-with-password`) and sends the user's JWT in the `Authorization` header.
- Store admin credentials only on the PocketBase server / hosting provider dashboard.

## 6. Backups

PocketBase stores everything in a single SQLite file: `pb_data/data.db`.

### Backup options
- **Filesystem backup**: Copy `pb_data/data.db` regularly.
- **Volume snapshots**: If using Docker/cloud volumes, take periodic snapshots of the data volume.
- **PocketBase built-in**: Use the Admin UI to export collections as JSON.

### Restore
Replace `pb_data/data.db` with your backup and restart PocketBase.

## 7. GitHub Pages Deployment

1. Push your LAGS-UNBLOCKED folder to a GitHub repository named `LAGS-UNBLOCKED`.
2. In the repo **Settings → Pages**, set source to the `main` branch, folder `/ (root)`.
3. Your site: `https://YOURUSERNAME.github.io/LAGS-UNBLOCKED/`
4. Set `POCKETBASE_URL` in `config.js` to your live PocketBase HTTPS URL before pushing.

All existing game pages (`games/*/index.html`) continue to work through GitHub Pages via relative paths.

## 8. Testing Checklist

- [ ] Register a new username (reject duplicates, validate password length).
- [ ] Log in and out; session persists on refresh.
- [ ] Follow / unfollow another user.
- [ ] View People You May Know recommendations.
- [ ] Upvote / remove vote on a game; count updates without reload.
- [ ] Create / rename / delete a collection; add / remove games.
- [ ] View own profile and another user's profile.
- [ ] Homepage rankings (Most Upvoted / Trending) reflect backend votes.
- [ ] With `POCKETBASE_URL` empty, site still loads and games play (social features disabled gracefully).
