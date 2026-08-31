export interface UploadSlot {
  /** Headers the client must include (e.g. Content-Type for S3) */
  headers: Record<string, string>;
  /** PUT for S3/R2 presigned URLs, POST for local multipart */
  method: "PUT" | "POST";
  /** URL the client sends the file to */
  url: string;
}

export interface StorageDriver {
  /** Generate an upload slot for the client to PUT/POST the file to. */
  createUploadSlot(params: {
    objectKey: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<UploadSlot>;

  /** Delete an object from storage. */
  delete(objectKey: string): Promise<void>;

  /** Read an object's bytes back — used by the /api/uploads/files proxy
   * route to serve files without exposing a direct bucket/CDN URL. */
  download(objectKey: string): Promise<Buffer>;

  /** Verify the object exists in storage after the client upload. */
  exists(objectKey: string): Promise<boolean>;

  /** Return the stable public URL for a stored object — always an
   * app-relative path served by the /api/uploads/files proxy, regardless of
   * driver, so the browser never needs direct access to the storage backend
   * for reads (only presigned PUT uploads bypass the app, for s3/r2). */
  getPublicUrl(objectKey: string): string;
}
