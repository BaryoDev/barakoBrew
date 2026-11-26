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
| Swagger | http://localhost:5005/swagger, when `SWAGGER_ENABLED=true` in your `.env` |

Sign in to the console with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`.

## What the containers are allowed to do

Both ports are published on `127.0.0.1` only, so nothing outside the machine reaches them until you
put a reverse proxy in front. Every container drops all Linux capabilities (Postgres gets back the
five it needs to own its data directory) and runs with `no-new-privileges`. Postgres and the
console run with a read-only root filesystem and a tmpfs for what they write. The console copies its
server to `/tmp` at start, which is how the API address and base path reach it without writing into
the image, so its tmpfs (128 MB in the compose file) holds about 16 MB of it. The API runs with a writable filesystem.

To publish a port on every interface instead, change its `ports:` line to `"0.0.0.0:..."`.

## Behind a domain

Put a reverse proxy terminating TLS in front of both, then set in `.env`:

```env
ASPNETCORE_ENVIRONMENT=Production
PUBLIC_API_URL=https://cms.example.com        # what the browser calls
ALLOWED_ORIGINS=https://console.example.com   # where the console is served
APP_BASE_URL=https://cms.example.com          # what the API puts in links it hands out
ALLOWED_HOSTS=cms.example.com                 # the Host headers the API answers to, semicolon separated
BARAKO_API_TAG=5.8.0                          # pin releases rather than latest
BARAKO_CONSOLE_TAG=1.15.0                     # the console release this compose file was checked with
```

`CONSOLE_READ_ONLY` (default `true`) runs the console with a read-only filesystem. A console older than 1.14.0 writes into its own image at start and cannot start read-only, so set it to `false` to run one.

`ALLOWED_HOSTS` defaults to `localhost;127.0.0.1`, which is enough for the URLs above on one
machine. Behind a domain, list the domain, and list every name the API is reached by (separate them
with semicolons, no spaces). barakoCMS 6.0 refuses to start in Production when it is empty or `*`, so
this compose no longer defaults to `*`. If you relied on that default, set `ALLOWED_HOSTS` in `.env`
before you upgrade or the API will not answer requests for your domain.

Pick the pair from the compatibility table in the main README's "Which barakoCMS it works with".
A console refuses to run against an API whose contract it does not speak.

The API's refresh cookie is `Secure` outside Development, so a Production API on plain HTTP
cannot keep a console session. That is the API refusing an insecure setup, not a bug.

To serve the console under a sub-path (`example.com/cms`), set `CONSOLE_BASE_PATH=/cms` in `.env`.
The published image writes it in at start, so there is nothing to rebuild; unset, it serves the
domain root. The main README's "Serving under a sub-path" has the proxy rule.

To edit a page's `Blocks` field as blocks rather than JSON, set `PUBLIC_PRESS_URL` to the
barakoPress site that renders the pages. See [`docs/blocks.md`](../docs/blocks.md).

The API's own settings (modules, email, analytics, social sign-in, proxies, backups) are documented
in the [barakoCMS quickstart](https://github.com/BaryoDev/barakoCMS/tree/master/quickstart). This
file only carries what the console needs.

## Upgrading

The defaults in `docker-compose.yml` name the newest releases whose images are published, and move
by hand after each release. To move sooner, or to stay where you are, set `BARAKO_API_TAG` and
`BARAKO_CONSOLE_TAG` in `.env`, then:

```bash
docker compose pull
docker compose run --rm --no-deps api db-assert
docker compose up -d
```

`db-assert` exits 0 when the database already holds everything the new API declares, and non-zero
listing what is outstanding. Unless `ASPNETCORE_ENVIRONMENT` is Development (this compose defaults
to Production), the API creates a missing table on start but never alters an existing one. So a
release that changes a table you already have fails to start until that change is applied. The
[barakoCMS production guide](https://github.com/BaryoDev/barakoCMS/blob/master/docs/deploy-in-production.md#upgrading)
says how.

## Data

Postgres data lives in the `pgdata` volume. Back it up with `pg_dump`, reading the database
name and user from the container rather than repeating them, so a changed `DB_NAME` or
`DB_USER` cannot dump the wrong database:

```bash
docker compose exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```
