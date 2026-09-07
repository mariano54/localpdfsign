#!/usr/bin/env bash
set -euo pipefail
# Run with AWS credentials already in the environment. No keys are saved here.
# CloudFront certificates must reside in us-east-1, so the stack and S3 origin do too.
cd "$(dirname "$0")/.."
STACK_NAME="${STACK_NAME:-localpdfsign}"
DOMAIN_NAME="${DOMAIN_NAME:-}"
HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-}"
if [[ -n "$DOMAIN_NAME" && -z "$HOSTED_ZONE_ID" ]]; then
  echo 'Set HOSTED_ZONE_ID when supplying DOMAIN_NAME.' >&2
  exit 1
fi
npm ci
npm test
npm run check
npm run build
aws cloudformation deploy --region us-east-1 --stack-name "$STACK_NAME" \
  --template-file infra/site.json --no-fail-on-empty-changeset \
  --parameter-overrides "DomainName=$DOMAIN_NAME" "HostedZoneId=$HOSTED_ZONE_ID"
BUCKET_NAME=$(aws cloudformation describe-stacks --region us-east-1 --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --region us-east-1 --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' --output text)
# Publish versioned assets first. Retain prior assets so already-open tabs keep working.
aws s3 sync dist/assets/ "s3://$BUCKET_NAME/assets/" --region us-east-1 --cache-control 'public,max-age=31536000,immutable'
aws s3 sync dist/ "s3://$BUCKET_NAME/" --region us-east-1 --exclude 'assets/*' --exclude 'index.html' --cache-control 'public,max-age=300'
# Publish entry point last with revalidation on every navigation.
aws s3 cp dist/index.html "s3://$BUCKET_NAME/index.html" --region us-east-1 --content-type 'text/html; charset=utf-8' --cache-control 'no-cache,max-age=0,must-revalidate'
INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/' '/index.html' '/robots.txt' '/sitemap.xml' '/favicon.svg' --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$INVALIDATION_ID"
aws cloudformation describe-stacks --region us-east-1 --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs'
