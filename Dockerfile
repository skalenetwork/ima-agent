FROM ubuntu:jammy

RUN apt-get update
RUN apt-get install --no-install-recommends -yq software-properties-common
RUN apt-get update
RUN apt-get install --no-install-recommends -y build-essential zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libssl-dev libreadline-dev libffi-dev wget curl sudo git

# NOTICE: we need to install SSL 1.1 manually here in order to make BLS command line tools working
RUN echo "deb http://security.ubuntu.com/ubuntu focal-security main" | tee /etc/apt/sources.list.d/focal-security.list
RUN apt-get update
RUN apt-get install --no-install-recommends -y unzip curl wget
# NOTICE: to remove extra dep above: sudo rm /etc/apt/sources.list.d/focal-security.list

RUN wget https://www.openssl.org/source/old/1.1.0/openssl-1.1.0l.tar.gz
RUN tar xfz openssl-1.1.0l.tar.gz 
RUN cd openssl-1.1.0l && ./config && make && make install && cd ..
RUN ldconfig

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr bash -s "bun-v1.0.16"
RUN bun --version

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash
RUN apt-get install --no-install-recommends -y nodejs
RUN npm install npm --global
RUN npm install --global yarn
RUN npm --version
RUN yarn --version

RUN curl -O https://www.python.org/ftp/python/3.7.3/Python-3.7.3.tar.xz
RUN tar -xf Python-3.7.3.tar.xz
RUN cd Python-3.7.3; ./configure --enable-optimizations; make -j 4 build_all; make altinstall; cd ..
RUN python3.7 --version
RUN which python3.7
RUN rm -f /usr/bin/python3
RUN ln -s /usr/local/bin/python3.7 /usr/bin/python3
RUN python3 --version
RUN which python3

RUN mkdir /ima
WORKDIR /ima

COPY package.json package.json

COPY runner runner
COPY src src
COPY src/pow src/build/pow
RUN mkdir IMA
COPY IMA/proxy IMA/proxy
COPY IMA/package.json IMA/package.json
COPY IMA/postinstall.sh IMA/postinstall.sh
COPY IMA/VERSION IMA/VERSION
COPY package.json package.json
COPY VERSION VERSION

COPY network-browser network-browser
RUN cd network-browser && bun install && bun build:rollup

RUN mkdir /ima/bls_binaries
COPY scripts/bls_binaries /ima/bls_binaries

RUN chmod +x /ima/bls_binaries/bls_glue
RUN chmod +x /ima/bls_binaries/hash_g1
RUN chmod +x /ima/bls_binaries/verify_bls

RUN npm install -g node-gyp
RUN which node-gyp
RUN node-gyp --version

WORKDIR /ima
RUN yarn install
RUN yarn rebuild

CMD ["bash", "/ima/runner/run.sh"]
