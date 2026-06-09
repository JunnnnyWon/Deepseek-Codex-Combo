FROM node:24-bookworm-slim

ARG CODEX_CLI_VERSION=0.130.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git procps zsh \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@10.33.0 --activate \
  && npm install -g @openai/codex@${CODEX_CLI_VERSION}

RUN useradd --create-home --shell /bin/bash --uid 10001 dcc-user

ENV HOME=/home/dcc-user
ENV CODEX_HOME=/home/dcc-user/.codex
ENV PNPM_HOME=/home/dcc-user/.local/share/pnpm
ENV PATH=/home/dcc-user/.local/share/pnpm:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /work/Deepseek-Codex-Combo
COPY --chown=dcc-user:dcc-user . /work/Deepseek-Codex-Combo
RUN chown -R dcc-user:dcc-user /work
USER dcc-user

CMD ["bash"]
