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
ARG FFMPEG_ARCHIVE=https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz

RUN dnf install -y tar xz gzip ca-certificates && dnf clean all \
    && curl -fsSL -o /usr/local/bin/yt-dlp \
        "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
    && chmod 755 /usr/local/bin/yt-dlp \
    && curl -fsSL -o /tmp/ffmpeg.tar.xz "${FFMPEG_ARCHIVE}" \
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
