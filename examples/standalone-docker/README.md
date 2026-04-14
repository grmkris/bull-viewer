# standalone-docker

Boots Redis + bull-viewer + a tiny seeder so the dashboard has something to
look at out of the box.

```sh
docker compose up
```

Open <http://localhost:3000>.

To run against a different Redis, set `REDIS_URL` and `BULL_VIEWER_QUEUES`
on the `bull-viewer` service. To enable basic auth, uncomment the three
`BULL_VIEWER_AUTH_*` env vars.

For multi-tenant mode, replace the env block with:

```yaml
environment:
  BULL_VIEWER_TENANTS_JSON: |
    [
      {"id":"prod","label":"Production","redis":"redis://prod-redis:6379","queues":["emails","reports"]},
      {"id":"staging","label":"Staging","redis":"redis://staging-redis:6379","queues":["emails"]}
    ]
```
