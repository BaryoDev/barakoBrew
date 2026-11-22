# Pinned by digest so a moved tag cannot change what the build starts from. Dependabot's docker
# entry bumps the tag and the digest together.
FROM node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
    else echo "Lockfile not found." && exit 1; \
    fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Where the browser reaches the API. Overridden at container start by entrypoint.sh.
ARG NEXT_PUBLIC_API_URL
# Set it as environment variable so Next.js can use it during build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# The sub-path the console is served under (e.g. /barakocms behind a shared reverse proxy).
# Next.js resolves basePath during the build, so the image is built against this placeholder and
# entrypoint.sh writes the real prefix into the output at container start, from BARAKO_BASE_PATH.
# Unset there means the domain root. Passing a real path here bakes it in the way every build
# used to, and an image built that way ignores BARAKO_BASE_PATH.
ARG NEXT_BASE_PATH=/__BARAKO_BASE_PATH__
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH

# The Content-Security-Policy lists the origins the browser may call. The API and press addresses are
# chosen at container start, so the image is built with this placeholder in connect-src and
# entrypoint.sh swaps in the origins of NEXT_PUBLIC_API_URL and NEXT_PUBLIC_PRESS_URL. An ENV and not
# an ARG, so it is not a build input (scripts/check-dockerfile-args.sh).
ENV BARAKO_CONNECT_PLACEHOLDER=__BARAKO_CONNECT_ORIGINS__

# The version this image is tagged with, so a running container can say what it is. Without it the
# only record of what an image holds is the tag on the outside, and package.json says 0.1.0 forever.
ARG BARAKO_VERSION=0.0.0-dev
ENV NEXT_PUBLIC_ADMIN_VERSION=$BARAKO_VERSION

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN \
    if [ -f yarn.lock ]; then yarn run build; \
    elif [ -f package-lock.json ]; then npm run build; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
    else echo "Lockfile not found." && exit 1; \
    fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy entrypoint script and make it executable
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

COPY --from=builder /app/public ./public

# Copy only the output traces, which keeps the image small
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The LGPL obligation attaches to what this image redistributes, not to what is in the repository,
# so the notice has to travel with the image. next build traces sharp's prebuilt libvips binaries
# into the standalone output above, and those are LGPL-3.0-or-later.
COPY --chown=nextjs:nodejs THIRD-PARTY-NOTICES.md LICENSE ./

# The fonts in .next/static are under the SIL Open Font License, which asks that the licence travels
# with every copy of them. Named one by one, because a wildcard that matches nothing copies nothing
# and the build still passes.
COPY --chown=nextjs:nodejs \
    src/app/fonts/OFL-bricolage-grotesque.txt \
    src/app/fonts/OFL-instrument-sans.txt \
    src/app/fonts/OFL-jetbrains-mono.txt \
    ./font-licences/

# The server needs node and nothing else. The base image also carries npm, corepack and yarn, which
# bring their own dependency trees (pacote, sigstore, brace-expansion and others) that an image scan
# reports and that nothing here runs. Removing them closes those findings instead of listing them.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER nextjs

EXPOSE 3000

ENV PORT=3000

# Nothing under /app is written at run time. entrypoint.sh copies the server and its build output
# here, writes the base path, the policy origins and env-config.js into the copy and starts from
# it, so the image runs with a read-only root filesystem and a tmpfs on /tmp. Size that tmpfs for
# the copy (about 64m) and the Next cache.
ENV BARAKO_RUNTIME_DIR=/tmp/barako-app

# Any answer below 500 means the server is up: under a base path the root is a 404, and that is
# still a live server. No curl in this image, so node asks.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
