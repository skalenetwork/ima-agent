FROM node:24.22.2-bookworm-slim AS agent
WORKDIR /ima/src
COPY src ./
RUN yarn install --frozen-lockfile && yarn build && yarn install --frozen-lockfile --production

FROM oven/bun:1.4.4 AS network-browser
WORKDIR /ima/network-browser
COPY network-browser ./
RUN bun install --frozen-lockfile && bun run build:rollup && rm -rf node_modules && bun install --frozen-lockfile --production

FROM ubuntu:24.04
ARG LIB_BLS_VERSION=0.8.1
ADD --chmod=755 --checksum=sha256:7943438696ee3dc7d7dd1d34e70fc5bf86da3945588c21511ac9afc5f9c5502a \
    https://github.com/skalenetwork/libBLS/releases/download/${LIB_BLS_VERSION}/bls_glue /ima/bls_binaries/
ADD --chmod=755 --checksum=sha256:33fdd8999edc359a1f511d40a5c2bc65128ad8871580095d5f7a47ebde7a6c4a \
    https://github.com/skalenetwork/libBLS/releases/download/${LIB_BLS_VERSION}/hash_g1 /ima/bls_binaries/
ADD --chmod=755 --checksum=sha256:c6d2ad34428865294359fdfcb0ab5f0a7c6ec6155891616fe3a1e7905d3ba4b7 \
    https://github.com/skalenetwork/libBLS/releases/download/${LIB_BLS_VERSION}/verify_bls /ima/bls_binaries/
COPY --from=agent /usr/local/bin/node /usr/local/bin/node
WORKDIR /ima
COPY VERSION ./
COPY runner runner
COPY --from=agent /ima/src/package.json /ima/src/about.txt src/
COPY --from=agent /ima/src/build src/build
COPY --from=agent /ima/src/node_modules src/node_modules
COPY --from=network-browser /ima/network-browser/package.json network-browser/
COPY --from=network-browser /ima/network-browser/build network-browser/build
COPY --from=network-browser /ima/network-browser/node_modules network-browser/node_modules
RUN ! ldd /ima/bls_binaries/* /ima/src/build/pow 2>&1 | grep "not found"
STOPSIGNAL SIGINT
CMD ["bash", "/ima/runner/run.sh"]
