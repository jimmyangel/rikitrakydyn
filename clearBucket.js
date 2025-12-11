import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3"

const REGION = "us-west-2"
const BUCKET = "rikitraki"

const s3 = new S3Client({ region: REGION })

async function emptyBucket(bucket) {
  let continuationToken = undefined
  let totalDeleted = 0

  while (true) {
    const listParams = {
      Bucket: bucket,
      ContinuationToken: continuationToken
    }

    const listed = await s3.send(new ListObjectsV2Command(listParams))

    if (!listed.Contents || listed.Contents.length === 0) {
      console.log("Bucket is already empty.")
      break
    }

    const deleteParams = {
      Bucket: bucket,
      Delete: {
        Objects: listed.Contents.map(obj => ({ Key: obj.Key }))
      }
    }

    const deleteResult = await s3.send(new DeleteObjectsCommand(deleteParams))
    const deletedCount = deleteResult.Deleted?.length || 0
    totalDeleted += deletedCount

    console.log(`Deleted ${deletedCount} objects...`)

    if (!listed.IsTruncated) break
    continuationToken = listed.NextContinuationToken
  }

  console.log(`Finished. Total objects deleted: ${totalDeleted}`)
}

emptyBucket(BUCKET).catch(err => {
  console.error("Error emptying bucket:", err)
  process.exit(1)
})
