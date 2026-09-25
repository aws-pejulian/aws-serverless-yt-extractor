# Amazon Linux 2023 Lambda base. CDK builds this for linux/amd64.
FROM public.ecr.aws/lambda/nodejs:24 AS build
WORKDIR /build
RUN npm install --global esbuild@0.28.2
COPY src/backend /build/src/backend
COPY src/shared /build/src/shared
RUN npm install --prefix /build @aws-sdk/cloudfront-signer@3.1138.0 \
    && esbuild /build/src/backend/handler.ts \
        --bundle \
        --platform=node \
        --target=node24 \
        --format=esm \
        --outfile=/out/index.js \
        --external:@aws-sdk/client-s3 \
        --external:@aws-sdk/client-sns \
        --external:@aws-sdk/client-ssm

FROM public.ecr.aws/lambda/nodejs:24

ARG YT_DLP_VERSION=2026.08.19
ARG YT_DLP_SHA256=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a
ARG FFMPEG_BUILD=autobuild-2026-09-20-17-29
ARG FFMPEG_VERSION=N-126732-g5d3cb3dc17
ARG FFMPEG_SHA256=fcafdfacab0a1d513020e7bde3440ee3e0820ef190a1e120df77b7fafe61de1f

RUN dnf install -y tar xz gzip ca-certificates coreutils && dnf clean all \
    && curl -fsSL -o /tmp/yt-dlp \
        "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
    && echo "${YT_DLP_SHA256}  /tmp/yt-dlp" | sha256sum -c - \
    && mv /tmp/yt-dlp /usr/local/bin/yt-dlp \
    && chmod 755 /usr/local/bin/yt-dlp \
    && curl -fsSL -o /tmp/ffmpeg.tar.xz \
        "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/${FFMPEG_BUILD}/ffmpeg-${FFMPEG_VERSION}-linux64-gpl.tar.xz" \
    && echo "${FFMPEG_SHA256}  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
    && mkdir -p /tmp/ffmpeg \
    && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg --strip-components=1 \
    && mv /tmp/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg \
    && mv /tmp/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe \
    && chmod 755 /usr/local/bin/ffmpeg /usr/local/bin/ffprobe \
    && rm -rf /tmp/ffmpeg /tmp/ffmpeg.tar.xz

ENV YTDLP_NO_UPDATE=1 \
    XDG_CACHE_HOME=/tmp

COPY --from=build /out/index.js ${LAMBDA_TASK_ROOT}/index.js
COPY src/backend/package.json ${LAMBDA_TASK_ROOT}/package.json

CMD ["index.handler"]
