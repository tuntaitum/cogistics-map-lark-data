# Setup guide

This rebuild has four moving parts:

1. **A Lark Base** — this is now your database. Add/edit/delete a pin by editing a row. Add a whole new pin group by adding a row to the Groups table.
2. **Your existing Railway bot** — gets one new endpoint, `GET /pins`, that reads the Base (it already holds your Lark credentials) and returns clean JSON. Lark credentials live only here now, not in the Vercel project.
3. **Two Vercel Edge Functions** (`/api/login`, `/api/pins`) — `login` checks the password and hands out a session cookie; `pins` checks that cookie, then just proxies the request to your bot's `/pins` endpoint.
4. **Routing Middleware** (`middleware.js`) — gates every page and API route behind that session cookie, redirecting anyone unauthenticated to `login.html`.

Nothing edits Lark from the web page — editing happens directly in Lark, by whoever you share the Base with. The site just reads it, via the bot.

---

## 1. Build the Lark Base

Create a new Base (or a new set of tables in an existing one) with exactly these two tables:

### Table: `Groups`
One row per pin group (this replaces the hardcoded `LAYERS` array).

| Field name | Type | Notes |
|---|---|---|
| **Group ID** | Single select (primary field) | Short unique key, e.g. `affiliated`, `seven`, `office`. Set this field's options to be shared/referenced by the `Group` field in the Pins table below, so both stay in sync automatically. |
| **Label** | Text | Display name shown on the toggle button and legend, e.g. "Affiliated Cold Storages" |
| **Color** | Text | Hex code, e.g. `#ff0000` |
| **Active By Default** | Checkbox | Whether this layer is shown when the map first loads |
| **Popup Style** | Single select, options: `Full Popup`, `Label Only` | `Full Popup` = always-open detail popup (use for your own affiliated locations); `Label Only` = a small name tag next to the pin (use for everything else) |

**To add a brand-new group later:** add a row here, then create the matching option once (the shared option list means it's immediately available to pick in the Pins table too).

**Ordering:** the map's toggle buttons follow the row order of this table's default view (drag rows in Lark to reorder). Keep that view unsorted/unfiltered, since either would override your manual order.

### Table: `Pins`

| Field name | Type | Notes |
|---|---|---|
| **Name** | Text (primary field) | Pin label |
| **Latitude** | Number | |
| **Longitude** | Number | |
| **Note** | Text | Only shown for `Full Popup` groups |
| **Group** | Single select, options shared/referenced from the Groups table's `Group ID` field | Picking from this dropdown always matches a real group — renaming a group in Groups updates every pin that references it |
| **Show On Map** | Checkbox | Leave unchecked to hide a pin without deleting it |

Feel free to add more columns to this table for your own use (tracking, internal notes, whatever) — the map only reads the fields listed above by exact name, so anything else you add is simply ignored.

**To add/edit/delete a pin:** add, edit, or delete a row here. Refreshing the map (or waiting up to 15 seconds — see caching note below) picks up the change.

**On the Google Maps autocomplete idea:** since edits now happen straight in the Lark sheet, there's no custom "add pin" form in the app to attach an autocomplete box to. The simplest way to get coordinates while filling in the sheet is to right-click a spot on [Google Maps](https://maps.google.com) or [OpenStreetMap](https://www.openstreetmap.org) and copy the lat/lng it shows, then paste into the two columns. If this becomes a real point of friction, a small standalone "look up an address" helper page (using free OpenStreetMap search, no billing account needed) is a quick follow-up addition — just say the word.

---

## 2. Add a `/pins` endpoint to lark-automation-bot

Your bot (github.com/tuntaitum/lark-automation-bot) already has `getTenantAccessToken()` in `src/lark/auth.js`, and `src/lark/base.js` already proves the app can read a Lark Base (that's what powers the `/story` command). This is the same pattern, extended to a new Base — no new Lark app permissions needed.

**Add `src/lark/map.js`** — see `bot-additions/src/lark/map.js` in this bundle for the exact file. It exports `getMapData()`, which reads the Groups + Pins tables and returns `{ groups, pins }` in the schema from step 1.

**Edit `src/server.js`** — see `bot-additions/server-js-additions.txt` for the exact snippet: one new import, and one new route next to your existing `/ping`:

```js
app.get('/pins', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.MAP_API_KEY}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const data = await getMapData();
    res.json(data);
  } catch (error) {
    console.error('Failed to fetch map data:', error.message);
    res.status(502).json({ error: error.message });
  }
});
```

**In Lark:** share the new Base with the app the same way the Story Base is shared (Base → Share → add the app as a collaborator) — `getTenantAccessToken()` only sees Bases the app has been added to.

## 3. Set environment variables

**On Railway (the bot)** — same naming convention as your existing `STORY_BASE_APP_TOKEN` / `STORY_TABLE_ID`:

| Variable | Value |
|---|---|
| `MAP_BASE_APP_TOKEN` | App Token of the new pins Base |
| `MAP_GROUPS_TABLE_ID` | Table ID of the Groups tab |
| `MAP_PINS_TABLE_ID` | Table ID of the Pins tab |
| `MAP_API_KEY` | a long random string — generate one with `openssl rand -base64 32` — the map project needs the same value |

**On Vercel (the map):**

| Variable | Value |
|---|---|
| `BOT_BASE_URL` | your bot's public Railway URL, e.g. `https://your-bot.up.railway.app` |
| `MAP_API_KEY` | the exact same value you set on Railway |
| `MAP_PASSWORD` | whatever password you want to gate the map with |
| `SESSION_SECRET` | a long random string — generate one with `openssl rand -base64 32` |

Redeploy both after adding these (env var changes need a new deployment to take effect).

## 4. Deploy

Push this repo to GitHub and reconnect/redeploy the Vercel project as usual — no build command needed, it's still zero-config.

---

## How the pieces fit together

- Visiting `/` with no valid session cookie → Routing Middleware redirects you to `/login.html`
- `/login.html` posts your password to `/api/login`; on success it gets a signed, `HttpOnly` cookie and redirects back to `/`
- `/` (the map) fetches `/api/pins`, which checks that cookie, then calls your bot's `/pins` endpoint with the shared bot API key, and passes the JSON straight through
- The map renders from that JSON exactly like before — same colors, same "always-open popup" behavior for your own locations, same permanent name tags for everyone else's DCs

Two independent locks, doing two different jobs: the session cookie is "is this a browser someone logged into," the bot API key is "is this request actually coming from the map's server" — keep both.

## Honest limits, so there are no surprises

- This stops **casual** inspection (view-source, no more hardcoded coordinates) and gates the whole site behind a password. It does **not** stop someone who's logged in from opening the Network tab and reading the `/api/pins` response — the browser has to receive the coordinates to draw the pins, and there's no way around that for any web map. Treat the password the same way you'd treat any shared internal-tool password.
- `/api/pins` responses are cached for 15 seconds per browser to avoid hammering your bot on every refresh — so an edit in the sheet shows up within about 15 seconds of a refresh, not instantly.
- Since the Group ID and Group options are shared/synced, this shouldn't come up in normal use — but the map's code still has a defensive fallback: if a pin ever ends up with a group value that doesn't match any row in the Groups table (e.g. a group option gets deleted while pins still reference it), those pins show up in a visible "Ungrouped" bucket rather than silently disappearing.
