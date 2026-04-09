#!/usr/bin/env bash
set -euo pipefail

BUCKET="$1"
TARGET_CACHE="public, max-age=0, must-revalidate"

if [ -z "$BUCKET" ]; then
  echo "Usage: $0 <bucket-name>"
  exit 1
fi

echo "Updating ONLY objects missing Cache-Control: $TARGET_CACHE"
echo

aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --query "Contents[].Key" \
  --output text | tr '\t' '\n' | while read -r KEY; do

  # Skip empty lines
  if [ -z "$KEY" ]; then
    continue
  fi

  # Skip directory markers
  if [[ "$KEY" == */ ]]; then
    echo "Skipping directory marker: $KEY"
    continue
  fi

  echo "Checking: $KEY"

  # Check if object exists
  if ! aws s3api head-object --bucket "$BUCKET" --key "$KEY" >/dev/null 2>&1; then
    echo "  -> Skipping (object not found)"
    continue
  fi

  # Get current Cache-Control
  CURRENT_CACHE=$(aws s3api head-object \
    --bucket "$BUCKET" \
    --key "$KEY" \
    --query "CacheControl" \
    --output text)

  # If already correct, skip
  if [ "$CURRENT_CACHE" == "$TARGET_CACHE" ]; then
    echo "  -> Already correct, skipping"
    continue
  fi

  # Get Content-Type
  CONTENT_TYPE=$(aws s3api head-object \
    --bucket "$BUCKET" \
    --key "$KEY" \
    --query "ContentType" \
    --output text)

  echo "  -> Updating metadata"

  aws s3api copy-object \
    --bucket "$BUCKET" \
    --copy-source "$BUCKET/$KEY" \
    --key "$KEY" \
    --metadata-directive REPLACE \
    --cache-control "$TARGET_CACHE" \
    --content-type "$CONTENT_TYPE"

done

echo
echo "Done! All remaining objects updated."
