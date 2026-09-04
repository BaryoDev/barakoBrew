# barakoBrew quickstart

Postgres, the barakoCMS API and the console from published images. No build step, no .NET or Node
toolchain. You edit one `.env` and start it.

```bash
# from this quickstart/ folder
cp .env.example .env
#   edit .env: DB_PASSWORD, JWT_KEY (32+ characters), ADMIN_PASSWORD
docker compose up -d
```

Then open:

| | URL |
| --- | --- |
| Console | http://localhost:3000 |
| API | http://localhost:5005 |
| API health | http://localhost:5005/health |
| Swagger | http://localhost:5005/swagger, when `Swagger__Enabled=true` on the API |

Sign in to the console with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`.

## Behind a domain

Put a reverse proxy terminating TLS in front of both, then set in `.env`:

```env
ASPNETCORE_ENVIRONMENT=Production
PUBLIC_API_URL=https://cms.example.com        # what the browser calls
ALLOWED_ORIGINS=https://console.example.com   # where the console is served
APP_BASE_URL=https://cms.example.com          # what the API puts in links it hands out
ALLOWED_HOSTS=cms.example.com                 # the Host headers the API answers to
BARAKO_API_TAG=4.0.0                          # pin releases rather than latest
BARAKO_CONSOLE_TAG=1.0.0
```

The API's refresh cookie is `Secure` outside Development, so a Production API on plain HTTP
cannot keep a console session. That is the API refusing an insecure setup, not a bug.

To serve the console under a sub-path (`example.com/cms`) you need a base-path build of the image;
see the main README. The published image serves at the root.

The API's own settings (modules, email, analytics, social sign-in, proxies, backups) are documented
in the [barakoCMS quickstart](https://github.com/BaryoDev/barakoCMS/tree/master/quickstart). This
file only carries what the console needs.

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Schema migrations run on API start. Pin `BARAKO_API_TAG` and `BARAKO_CONSOLE_TAG` for deliberate
upgrades.

## Data

Postgres data lives in the `pgdata` volume. Back it up with `pg_dump`:

```bash
docker compose exec postgres pg_dump -U postgres barakocms > backup.sql
```
