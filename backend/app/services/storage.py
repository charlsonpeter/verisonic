import boto3
from botocore.client import Config
from app.core.config import settings
import logging
import json

logger = logging.getLogger(__name__)

# Initialize S3 Client
s3_options = {
    "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
    "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
    "region_name": settings.AWS_REGION,
    "config": Config(signature_version="s3v4")
}

if settings.S3_ENDPOINT_URL:
    s3_options["endpoint_url"] = settings.S3_ENDPOINT_URL

s3_client = boto3.client("s3", **s3_options)

def ensure_bucket_exists():
    try:
        s3_client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except Exception:
        try:
            logger.info(f"Creating S3 Bucket: {settings.S3_BUCKET_NAME}")
            s3_client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
        except Exception as e:
            logger.error(f"Failed to create bucket: {e}")

    # Apply public read bucket policy for transcoded and hls prefixes
    try:
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [
                        f"arn:aws:s3:::{settings.S3_BUCKET_NAME}/hls/*",
                        f"arn:aws:s3:::{settings.S3_BUCKET_NAME}/transcoded/*",
                        f"arn:aws:s3:::{settings.S3_BUCKET_NAME}/covers/*"
                    ]
                }
            ]
        }
        s3_client.put_bucket_policy(
            Bucket=settings.S3_BUCKET_NAME,
            Policy=json.dumps(policy)
        )
    except Exception as e:
        logger.error(f"Failed to set bucket policy: {e}")

def upload_file(file_bytes: bytes, key: str, content_type: str = None) -> str:
    """
    Uploads file bytes to S3/MinIO
    """
    ensure_bucket_exists()
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type
        
    s3_client.put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        Body=file_bytes,
        **extra_args
    )
    return key

def upload_file_path(file_path: str, key: str, content_type: str = None) -> str:
    """
    Uploads a local file path to S3/MinIO
    """
    ensure_bucket_exists()
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type
        
    s3_client.upload_file(
        Filename=file_path,
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        ExtraArgs=extra_args
    )
    return key

def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    """
    Generates a URL for temporary streaming/viewing.
    If the key starts with 'hls/' or 'transcoded/', it returns a direct public URL
    (without signing parameters) to allow uninterrupted segmented streaming.
    Otherwise, returns a pre-signed URL.
    """
    if not key:
        return ""

    is_public_resource = key.startswith("hls/") or key.startswith("transcoded/") or key.startswith("covers/")
    if is_public_resource:
        endpoint = settings.S3_ENDPOINT_URL or "http://localhost:9000"
        url = f"{endpoint}/{settings.S3_BUCKET_NAME}/{key}"
        if "minio:9000" in url:
            url = url.replace("http://minio:9000", "http://localhost/storage")
        return url

    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expires_in
        )
        # For development, replace docker container hostname with host machine hostname if needed
        if settings.S3_ENDPOINT_URL and "minio:9000" in url:
            url = url.replace("http://minio:9000", "http://localhost/storage")
        return url
    except Exception as e:
        logger.error(f"Error generating presigned URL: {e}")
        return ""

def delete_file(key: str):
    try:
        s3_client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except Exception as e:
        logger.error(f"Error deleting file from S3: {e}")
