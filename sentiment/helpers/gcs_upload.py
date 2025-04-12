from google.cloud import storage
import os

def upload_to_gcs(bucket_name, local_file_path, destination_blob_name, folder_prefix=None):
    """
    Uploads a file to Google Cloud Storage, optionally inside a folder (prefix).

    Args:
        bucket_name (str): The name of your GCS bucket.
        local_file_path (str): Full path to the file you want to upload.
        destination_blob_name (str): The name the file should have in the bucket.
        folder_prefix (str, optional): GCS "folder" (prefix) to upload into.

    Returns:
        str: The gs:// URI of the uploaded file.
    """
    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # Add prefix to filename if provided
    if folder_prefix:
        destination_blob_name = f"{folder_prefix}/{destination_blob_name}"

    blob = bucket.blob(destination_blob_name)

    print(f"Uploading {local_file_path} to gs://{bucket_name}/{destination_blob_name}...")
    blob.upload_from_filename(local_file_path)

    return f"gs://{bucket_name}/{destination_blob_name}"
