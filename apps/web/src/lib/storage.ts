import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export function getS3(): S3Client {
  if (!globalForS3.s3) {
    globalForS3.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    });
  }
  return globalForS3.s3;
}

export const BUCKETS = {
  attachments: process.env.S3_BUCKET_ATTACHMENTS ?? "attachments",
  photos: process.env.S3_BUCKET_PHOTOS ?? "photos",
} as const;

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await getS3().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectStream(bucket: string, key: string) {
  const res = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return { body: res.Body as Readable, contentType: res.ContentType, length: res.ContentLength };
}

export async function deleteObject(bucket: string, key: string) {
  await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
