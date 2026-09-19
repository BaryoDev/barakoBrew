# A fixture, not a build. It is the shape the gate exists to refuse: a new build ARG that changes
# what the image serves, which is how the base path came to need its own image in the first place.
FROM node:22-alpine AS builder

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_BASE_PATH=/__BARAKO_BASE_PATH__
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH

ARG BARAKO_VERSION=0.0.0-dev
ENV NEXT_PUBLIC_ADMIN_VERSION=$BARAKO_VERSION

ARG NEXT_TRAILING_SLASH
ENV NEXT_TRAILING_SLASH=$NEXT_TRAILING_SLASH
