declare module "backblaze-b2" {
  export default class B2 {
    authorizationToken: string | null;
    apiUrl: string | null;
    downloadUrl: string | null;
    accountId: string | null;

    constructor(options: {
      applicationKeyId: string;
      applicationKey: string;
    });

    authorize(): Promise<unknown>;
    getUploadUrl(args: { bucketId: string }): Promise<{
      data: { uploadUrl: string; authorizationToken: string };
    }>;
    uploadFile(args: {
      uploadUrl: string;
      uploadAuthToken: string;
      fileName: string;
      data: Buffer;
      mime?: string;
    }): Promise<{ data: { fileName: string; fileId: string } }>;
  }
}
