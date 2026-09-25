# YouTube audio extractor

A visitor in the allowed country pastes a YouTube URL and an email address. The site checks both, queues the job, and answers immediately. A container Lambda downloads the audio, stores an MP3 for one day, and emails a CloudFront download link. A failed extraction sends one failure email when the address can be read from the message.

The public hostname is `yt-audio-extractor.julian-pereira.com`.

## Process

1. CloudFront accepts the request only from the country in `GEO_COUNTRY_CODE` and calls the web Lambda function URL with its own signature. The function URL requires that signature, so a direct call never reaches the function.
2. The Qwik page validates the URL against a YouTube host allowlist and checks the email. Before it sends the job, it reads the queue depth. When visible and in-flight messages already add up to 20, it returns HTTP 503 with `The queue is full. Try again in a few minutes.` and does not enqueue. It also increments a DynamoDB counter for the UTC day. The 21st accepted job that day returns HTTP 503 with `The daily limit has been reached. Try again tomorrow.` A valid form under both limits returns HTTP 202 with `Your request is in the queue! Check your email in a few minutes` and sends the submission to SQS. The browser does not wait for the download.
3. SQS invokes the extractor with one message at a time. The function hides the message for 90 minutes, six times its 15-minute timeout, so a second worker cannot see it during the run. Before extraction starts, it writes `audio/claims/<message-id>` with `If-None-Match: *`. Only the first writer continues. A later delivery finds the object, skips the job, and deletes the message.
4. The container runs yt-dlp and FFmpeg, uploads the MP3 to S3, and signs a CloudFront URL that expires in 24 hours. It publishes that notice to SNS. A small notifier Lambda sends the email through SES.
5. Success and failure both delete the SQS message. There is no dead-letter queue. If the failure email cannot be sent, the message is still deleted.
6. S3 expires the object, its noncurrent versions, and incomplete multipart uploads after one day. The extractor can upload under `audio/*` and cannot read objects back. CloudFront reads the bucket through an origin access identity, and `/audio/*` requires the signed URL.

The extractor reserves 10 concurrent executions, and SQS will not invoke more than 10 at once. The web function reserves 50. A UTC day accepts at most 20 jobs, so those 10 slots cannot stay busy for the whole month. There is no API Gateway throttle in front of the site.

## Architecture

Two CDK stacks. `SiteCertificateStack` is in `CERTIFICATE_REGION` (`us-east-1`), because CloudFront certificates must live there. `AudioExtractorStack` is in `APP_REGION` (`ap-southeast-1`). Both import the existing Route 53 zone `julian-pereira.com`. They do not create a zone.

| Piece | Role |
| --- | --- |
| Route 53 | IPv4 A alias for the site, limited to the geo country. The set identifier is the lowercased country code. |
| ACM | DNS-validated certificate in `us-east-1`. |
| CloudFront | TLS, geo allowlist, Price Class 100, the only caller of the Qwik function URL, and the private S3 audio origin. |
| Qwik on Lambda | Node.js 24, 1024 MB, 30 seconds, reserved concurrency 50. Function URL auth is AWS IAM. Validates, checks queue depth and the daily cap, and enqueues. |
| DynamoDB | On-demand counter of accepted jobs per UTC day. Items expire after the day. The web function may only `UpdateItem`. |
| SQS | Standard queue, SSE-SQS, 90-minute visibility, two-day retention. |
| Extractor Lambda | Container image on Node.js 24 with pinned yt-dlp and FFmpeg checksums. 2048 MB memory, 2048 MB `/tmp`, 15 minutes, x86_64, reserved concurrency 10. |
| S3 | Private, versioned, encrypted, SSL-only. Objects expire after one day. |
| SNS and notifier | The extractor publishes a ready or failed notice. The notifier is Node.js 24, 128 MB, and calls SES `SendEmail` from `FROM_EMAIL`. |
| CloudWatch Logs | Extractor, web, notifier, signing-key, and provider logs are kept for 3 days. |

Orchestration is Lambda, SQS, and SNS. A deploy-time function creates the CloudFront signing key and stores the private key in SSM Parameter Store.

## Deployment

Deploys are manual. The workflow in `.github/workflows/deploy.yml` runs only from **Actions → Deploy → Run workflow**. A push to `main` or `master` does not start it.

Account setup is a prerequisite. Create the GitHub Actions deploy role first by following [github-oidc](https://github.com/aws-pejulian/github-oidc). This workflow assumes that role with OIDC. No AWS access keys are stored in GitHub. The workflow has `id-token: write`.

In the extractor repository, set these Actions variables (**Settings → Secrets and variables → Actions → Variables**):

| Variable | Purpose |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | ARN of `github-cdk-deploy` |
| `HOSTED_ZONE_ID` | Existing `julian-pereira.com` zone |
| `ROOT_DOMAIN` | `julian-pereira.com` |
| `SITE_DOMAIN` | `yt-audio-extractor.julian-pereira.com` |
| `FROM_EMAIL` | SES from address, `noreply@julian-pereira.com` |
| `GEO_COUNTRY_CODE` | CloudFront and Route 53 country, `MY` |
| `APP_REGION` | Application stack region, `ap-southeast-1` |
| `CERTIFICATE_REGION` | Certificate stack region, `us-east-1` |

The workflow checks that every variable is set, assumes the role in `APP_REGION`, and runs `pnpm run deploy --all --require-approval never`. That builds the Qwik site and deploys both stacks. Site settings come from those variables. There is no `.env` file.

Local commands use the same variables in the shell. Node.js is 24.21.0 (`.nvmrc` for nvm, `.tool-versions` for asdf) and pnpm is 12 or newer.

```bash
pnpm install
pnpm test
pnpm run synth
```
