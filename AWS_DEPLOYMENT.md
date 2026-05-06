# AWS Deployment Guide

## Recommended AWS target

For `MasTec Live`, the best AWS production path is:

- `Amazon ECS Fargate` for the Node app
- `Amazon ECR` for the container image
- `Amazon RDS for PostgreSQL` for shared production data
- `Amazon S3` for photos and attachments
- `Route 53` for DNS
- `ACM` for TLS certificates
- optional `CloudFront` later if you want broader caching or tighter edge control

## Important date note

As of **March 31, 2026**, AWS App Runner is no longer open to new customers.

That means:

- if your AWS account already has App Runner access, it can still be used
- if this is a fresh AWS setup, use `ECS Fargate`

## Why ECS Fargate is the right fit

This repo already has:

- a Node backend
- a browser frontend
- a Dockerfile
- a shared database layer
- attachment handling

So AWS does not need a rewrite.

You can treat the app as:

- one containerized web service
- one Postgres database
- one object storage bucket for files

## Architecture

### MVP production architecture

1. User opens `app.yourdomain.com`
2. Route 53 points traffic to the load balancer
3. Application Load Balancer forwards to ECS Fargate
4. ECS runs the `MasTec Live` Node container
5. The app connects to `RDS PostgreSQL`
6. Photos and files are stored in `S3`
7. The app serves signed or authenticated file URLs

### Roles of each AWS service

- `ECS Fargate`
  Runs the app container without you managing servers
- `ECR`
  Stores your Docker image
- `RDS PostgreSQL`
  Stores users, jobs, audit events, updates, and shared workflow state
- `S3`
  Stores before/after photos and attachments
- `ALB`
  Gives you a stable public HTTPS entry point
- `Route 53`
  Gives you clean DNS names
- `ACM`
  Gives you TLS certificates for HTTPS

## Best release model

### Field side

Deploy the field experience as an installable PWA over HTTPS.

This gives you:

- home screen install
- better mobile testing
- real phone usage
- offline support path
- no app store approval dependency yet

### Admin side

Keep the admin side web-based.

That fits dispatch, audit review, accounts, and operations oversight better than forcing it into a native wrapper early.

## Environment variables

This repo already uses:

- `PORT`
- `DATABASE_URL`
- `ATTACHMENTS_DIR`
- `ATTACHMENTS_BASE_PATH`
- `DATA_DIR`

For AWS production, I recommend this target set:

```env
NODE_ENV=production
PORT=4173
DATABASE_URL=postgresql://...
APP_BASE_URL=https://app.yourdomain.com
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
S3_BUCKET=mastec-live-prod-files
S3_PREFIX=jobs
ATTACHMENTS_BASE_PATH=/attachments
```

Recommended future additions:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SESSION_SECRET=replace-me
COOKIE_SECURE=true
COOKIE_DOMAIN=app.yourdomain.com
```

If you use ECS task roles correctly, you should avoid long-lived access keys and let the container use IAM role permissions instead.

## Repo changes I recommend next

### 1. Storage adapter

Replace local-disk-only attachment behavior with a storage adapter:

- `local` for development
- `s3` for production

Suggested shape:

- `src/storage/local.js`
- `src/storage/s3.js`
- `src/storage/index.js`

### 2. Signed or authenticated file access

For S3, do one of these:

- server streams protected files after auth check
- server returns a short-lived signed URL after auth check

The second option is usually better for photos.

### 3. Session/auth hardening

Before broad rollout, add:

- strong session secret
- secure cookies on HTTPS
- password reset flow
- better user/account lifecycle controls

### 4. Postgres-first production mode

Keep SQLite for local development, but production should use Postgres only.

### 5. Health and observability

Keep `/healthz` and add:

- structured logs
- CloudWatch log group
- container restart visibility
- DB connection failure visibility

## AWS build and deploy flow

### Step 1. Build locally

Use the existing [Dockerfile](C:\Users\yguev\OneDrive\Projects\Mastec Live\Dockerfile:1).

### Step 2. Push image to ECR

Create an ECR repository, authenticate Docker, tag the image, and push it.

### Step 3. Create RDS PostgreSQL

Create a Postgres instance in the same AWS Region and VPC path you plan to use for ECS.

### Step 4. Create S3 bucket

Create a bucket for job photos and attachments.

### Step 5. Create ECS Fargate service

Deploy the container behind an Application Load Balancer.

### Step 6. Add HTTPS and DNS

Use ACM and Route 53 for:

- `app.yourdomain.com`

### Step 7. Test the real workflow

Test:

- admin on desktop
- field user on phone
- close-out flow
- offline/reconnect
- attachment upload
- audit log behavior
- concurrency conflicts

## Suggested AWS layout

### Networking

- 1 VPC
- 2 public subnets for ALB
- 2 private subnets for ECS tasks
- 2 private subnets for RDS

### Security groups

- `alb-sg`
  allow 80/443 from internet
- `ecs-app-sg`
  allow app traffic from `alb-sg`
- `rds-sg`
  allow 5432 only from `ecs-app-sg`

## Container recommendation

The current Dockerfile is enough for initial testing, but I recommend tightening it before production:

- copy `package*.json` first
- run `npm install --omit=dev`
- then copy the app
- optionally run as a non-root user

## AWS service choice summary

### Best for this repo now

- `ECS Fargate`

### Only if your AWS account already has it

- `App Runner`

### Not the best first fit here

- `Amplify Hosting`

Why not Amplify first:

- this app is not a frontend-only static site
- it has a custom Node server and shared backend behavior
- ECS fits that shape better

## Practical rollout phases

### Phase A: Proper public test deployment

- ECS Fargate
- ECR
- RDS Postgres
- keep attachments local inside the container only for a short test if needed

This is okay for very short internal testing, but not good enough for real field use because container-local files are not durable.

### Phase B: MVP deployment

- ECS Fargate
- RDS Postgres
- S3 attachments
- HTTPS custom domain

This is the real MVP deployment target.

### Phase C: Hardening

- autoscaling
- alarms
- backups
- lifecycle policies
- signed file URLs
- stricter auth/session policies

## What to test on AWS

### Functional

- login
- invite redemption
- admin job creation
- assignment
- technician accept/start/complete
- history and audit visibility

### Multi-user

- two techs acting on same job
- admin reassignment during field close-out
- repeated completion tap
- stale offline queue sync after another user changed the job

### Mobile

- install to home screen
- portrait layout
- navigation staying reachable
- no horizontal scroll
- offline queue behavior

## Initial scripts you will need

These are local prep scripts from the repo root:

```powershell
cd "C:\Users\yguev\OneDrive\Projects\Mastec Live"

& "C:\Program Files\Git\cmd\git.exe" status
& "C:\Program Files\Git\cmd\git.exe" add .
& "C:\Program Files\Git\cmd\git.exe" commit -m "Add AWS deployment guide"
& "C:\Program Files\Git\cmd\git.exe" push
```

## Recommended next implementation step

Before the actual AWS deployment, I would do these repo changes next:

1. Add S3-backed attachment storage.
2. Add a production-ready session/auth configuration.
3. Tighten the Dockerfile for production.
4. Add an ECS-focused deployment section or infrastructure files.

## Official AWS references

- App Runner source image services:
  [https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html](https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html)
- App Runner custom domains:
  [https://docs.aws.amazon.com/apprunner/latest/dg/manage-custom-domains.html](https://docs.aws.amazon.com/apprunner/latest/dg/manage-custom-domains.html)
- ECS Fargate getting started:
  [https://docs.aws.amazon.com/AmazonECS/latest/userguide/getting-started-fargate.html](https://docs.aws.amazon.com/AmazonECS/latest/userguide/getting-started-fargate.html)
- Pushing images to ECR:
  [https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push.html](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push.html)
- ECR image lifecycle and CLI flow:
  [https://docs.aws.amazon.com/AmazonECR/latest/userguide/getting-started-cli.html](https://docs.aws.amazon.com/AmazonECR/latest/userguide/getting-started-cli.html)
- Amazon RDS for PostgreSQL:
  [https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- Creating a PostgreSQL DB instance:
  [https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html)
- S3 presigned URLs:
  [https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html](https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html)
