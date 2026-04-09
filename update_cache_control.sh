#!/usr/bin/env bash

# Usage:
#   ./update_cache_control.sh rikitraki
#
# This script rewrites every object in the given S3 bucket
# so that it has:
#   Cache-Control: public, max-age=0, must-revalidate
#
# It preserves:
#   - Content-Type
#   - ACLs
#   - Keys
#   - Folder structure
#
# It updates:
#   - Cache-Control
#   - ETag (expected, because object is rewritten)
#   - Last-Modified (expected)

set -euo pipefail

BUCKET="$1"

if [ -z "$BUCKET" ]; then
  echo "Usage: $0 <bucket-name>"
  exit 1
fi

echo "Updating Cache-Control for all objects in bucket: $BUCKET"
echo

# List all objects
aws s3api list-objects-v2 --bucket "$BUCKET" --query "Contents[].Key" --output text | tr '\t' '\n' | while read -r KEY; do
  if [ -z "$KEY" ]; then
    continue
  fi

  echo "Rewriting: $KEY"

  aws s3api copy-object \
    --bucket "$BUCKET" \
    --copy-source "$BUCKET/$KEY" \
    --key "$KEY" \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=0, must-revalidate" \
    --content-type "$(aws s3api head-object --bucket "$BUCKET" --key "$KEY" --query ContentType --output text)"
done

echo
echo "Done! All objects now have Cache-Control: public, max-age=0, must-revalidate"
