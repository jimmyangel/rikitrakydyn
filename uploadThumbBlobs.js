import fs from "fs";
import readline from "readline";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "us-west-2" }); // adjust region

async function uploadThumbnailsFromExport(filePath, bucketName) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const track = JSON.parse(line);

    if (track.trackPhotos && Array.isArray(track.trackPhotos)) {
      track.trackPhotos.forEach(async (photo, idx) => {
        if (photo.picThumbBlob && photo.picThumbBlob.$binary && photo.picThumbBlob.$binary.base64) {
          const buffer = Buffer.from(photo.picThumbBlob.$binary.base64, "base64");

          // Construct a logical S3 key: group by trackId and photo index
          const key = `${track.trackId}/thumbnails/${idx}.jpg`;

          const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: "image/jpeg" // adjust if PNG
          });

          await s3.send(command);
          console.log(`Uploaded ${key}`);
        }
      })
    }
  }
}

// Usage
uploadThumbnailsFromExport("exports/tracks.json", "rikitraki")
  .catch(err => console.error("Error:", err));
