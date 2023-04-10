FROM mcr.microsoft.com/devcontainers/rust:0-1-bullseye

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y protobuf-compiler

RUN BIN="/usr/local/bin" && \
    VERSION="1.17.0" && \
    curl -sSL \
    "https://github.com/bufbuild/buf/releases/download/v${VERSION}/buf-$(uname -s)-$(uname -m)" \
    -o "${BIN}/buf" && \
    chmod +x "${BIN}/buf"
