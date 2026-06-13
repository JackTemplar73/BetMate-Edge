# BetMate Edge live odds Worker

This Worker lets the hosted dashboard refresh prices without exposing the Odds API key in browser JavaScript.

Required Cloudflare Worker secrets:

- `ODDS_API_KEY`

Required GitHub Actions secrets for automatic Worker deploys:

- `CLOUDFLARE_API_TOKEN`

Live refresh URL used by the dashboard:

```text
https://fifaworldcup-api.betmateedge.com/refresh
```

The static GitHub Pages data remains the fallback. If the Worker is unavailable, the dashboard reloads the latest saved JSON and says so.

Deployment is handled by GitHub Actions whenever the Worker files or `wrangler.toml` change.
