import asyncio
import os
import boto3
from botocore.exceptions import ClientError
from .logger import logger

from .config import NODE_ENV, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME
is_test = NODE_ENV == "test"

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


def validate_storage_key(key: str) -> str:
    """
    Validate and sanitize storage key to prevent path traversal and null-byte injection.
    Rejects keys with '..', null bytes, or empty path components.
    """
    if not key or not isinstance(key, str):
        raise ValueError("Storage key must be a non-empty string")
    if "\x00" in key:
        raise ValueError("Storage key contains null byte")
    
    normalized = key.replace("\\", "/").strip()
    parts = normalized.split("/")
    if any(part in ("..", ".") for part in parts if part):
        raise ValueError(f"Path traversal detected in storage key: {key}")
    
    clean_key = normalized.lstrip("/")
    if not clean_key:
        raise ValueError("Invalid storage key after sanitization")
    return clean_key


async def upload_file(key: str, body: bytes, content_type: str) -> str:
    clean_key = validate_storage_key(key)
    bucket_name = S3_BUCKET_NAME
    if is_test or not s3_client:
        return f"/dummy-storage/{bucket_name}/{clean_key}"

    try:
        await asyncio.to_thread(
            s3_client.put_object,
            Bucket=bucket_name,
            Key=clean_key,
            Body=body,
            ContentType=content_type,
        )
        return f"{S3_ENDPOINT}/{bucket_name}/{clean_key}"
    except Exception as e:
        logger.error(f"Failed to upload file to S3: {e}")
        raise e


async def delete_file(key: str) -> None:
    clean_key = validate_storage_key(key)
    if is_test or not s3_client:
        return
    try:
        await asyncio.to_thread(
            s3_client.delete_object,
            Bucket=S3_BUCKET_NAME,
            Key=clean_key,
        )
    except Exception as e:
        logger.error(f"Failed to delete file from S3: {e}")


storage_service = {
    "upload_file": upload_file,
    "delete_file": delete_file,
    "validate_storage_key": validate_storage_key,
}
