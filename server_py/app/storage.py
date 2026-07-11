import os
import boto3
from botocore.exceptions import ClientError
from .logger import logger

NODE_ENV = os.getenv("NODE_ENV", "development")
is_test = NODE_ENV == "test"

# S3 Configuration
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", "minioadmin")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "minioadminpass")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "intellihire")

s3_client = None

if not is_test:
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            region_name=S3_REGION,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            config=boto3.session.Config(signature_version="s3v4")
        )
        
        # Ensure bucket exists
        try:
            s3_client.head_bucket(Bucket=S3_BUCKET_NAME)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchBucket"):
                logger.info(f"MinIO bucket {S3_BUCKET_NAME} not found. Creating bucket...")
                s3_client.create_bucket(Bucket=S3_BUCKET_NAME)
                logger.info(f"MinIO bucket {S3_BUCKET_NAME} created successfully")
            else:
                logger.warning(f"Error checking bucket: {e}")
    except Exception as err:
        logger.warning(f"MinIO storage initialization failed: {err}")

async def upload_file(key: str, body: bytes, content_type: str) -> str:
    bucket_name = S3_BUCKET_NAME
    if is_test or not s3_client:
        return f"/dummy-storage/{bucket_name}/{key}"

    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=body,
            ContentType=content_type
        )
        return f"{S3_ENDPOINT}/{bucket_name}/{key}"
    except Exception as e:
        logger.error(f"Failed to upload file to S3: {e}")
        raise e

async def delete_file(key: str) -> None:
    if is_test or not s3_client:
        return
    try:
        s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=key)
    except Exception as e:
        logger.error(f"Failed to delete file from S3: {e}")

storage_service = {
    "upload_file": upload_file,
    "delete_file": delete_file
}
