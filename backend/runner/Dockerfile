# Sandbox image the judge runs submissions in.
# Build once:  docker build -t mini-judge-runner backend/runner
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
