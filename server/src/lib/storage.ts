import { S3Client, PutObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { config } from "../config.js";
import { logger } from "./logger.js";

const isTest = config.NODE_ENV === "test";

let s3Client: S3Client | null = null;

if (!isTest) {
  s3Client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID || "minioadmin",
      secretAccessKey: config.S3_SECRET_ACCESS_KEY || "minioadminpass",
    },
    forcePathStyle: true,
  });

  // Ensure bucket exists in MinIO asynchronously
  ensureBucketExists().catch((err) => {
    logger.warn({ err: err.name ?? err.message }, "MinIO bucket check failed. Ensure services are running.");
  });
}

async function ensureBucketExists() {
  if (!s3Client) return;
  const bucketName = config.S3_BUCKET_NAME || "intellihire";
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      logger.info({ bucketName }, "MinIO bucket not found. Creating bucket...");
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      logger.info({ bucketName }, "MinIO bucket created successfully");
    } else {
      throw err;
    }
  }
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucketName = config.S3_BUCKET_NAME || "intellihire";
  if (isTest || !s3Client) {
    // Return dummy URL during testing
    return `/dummy-storage/${bucketName}/${key}`;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // Return the full public URL from the configured endpoint
  return `${config.S3_ENDPOINT}/${bucketName}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  const bucketName = config.S3_BUCKET_NAME || "intellihire";
  if (isTest || !s3Client) return;

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );
}

export const storageService = {
  uploadFile,
  deleteFile,
};
