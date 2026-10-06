FROM ubuntu:jammy

RUN apt-get update
RUN apt-get install --no-install-recommends -yq software-properties-common
RUN apt-get update
RUN apt-get install --no-install-recommends -y build-essential python3 python3-dev zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libssl-dev libreadline-dev libffi-dev wget curl unzip sudo git

# libBLS release binaries require the OpenSSL 1.1.1 symbol version. Ubuntu
# Jammy only provides OpenSSL 3, so install the final OpenSSL 1.1.1 release as
# a compatibility library.
ARG OPENSSL_1_1_VERSION=1.1.1w
RUN wget "https://www.openssl.org/source/old/1.1.1/openssl-${OPENSSL_1_1_VERSION}.tar.gz" \
    && tar xfz "openssl-${OPENSSL_1_1_VERSION}.tar.gz" \
    && cd "openssl-${OPENSSL_1_1_VERSION}" \
    && ./config shared \
    && make -j"$(nproc)" \
    && make install_sw \
    && cd .. \
    && rm -rf "openssl-${OPENSSL_1_1_VERSION}" \
        "openssl-${OPENSSL_1_1_VERSION}.tar.gz" \
    && ldconfig

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr bash -s "bun-v1.0.16"
RUN bun --version

RUN curl -sL https://deb.nodesource.com/setup_22.x | bash
RUN apt-get install --no-install-recommends -y nodejs
RUN npm install npm --global
RUN npm install --global yarn
RUN npm --version
RUN yarn --version

RUN python3 --version
RUN which python3

RUN mkdir /ima
WORKDIR /ima

COPY package.json package.json

COPY runner runner
COPY src src
COPY src/pow src/build/pow
COPY IMA IMA
COPY package.json package.json
COPY VERSION VERSION

COPY network-browser network-browser
RUN cd network-browser && bun install && bun build:rollup

RUN mkdir /ima/bls_binaries
COPY scripts/bls_binaries /ima/bls_binaries

RUN chmod +x /ima/bls_binaries/bls_glue
RUN chmod +x /ima/bls_binaries/hash_g1
RUN chmod +x /ima/bls_binaries/verify_bls

# Fail the build if a BLS binary has a missing library or symbol version.
RUN for bin in bls_glue hash_g1 verify_bls; do \
        ldd "/ima/bls_binaries/$bin" 2>&1 | tee /dev/stderr | grep -q "not found" \
            && { echo "Unresolved dependency in $bin" >&2; exit 1; }; \
    done; true

RUN npm install -g node-gyp
RUN which node-gyp
RUN node-gyp --version

WORKDIR /ima
RUN yarn install
RUN yarn rebuild

CMD ["bash", "/ima/runner/run.sh"]
