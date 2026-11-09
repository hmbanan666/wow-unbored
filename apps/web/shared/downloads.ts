export type DownloadAsset = {
  name: string;
  url: string;
  size: number;
  sha256: string | null;
};
export type ReleaseDownloads = {
  version: string;
  publishedAt: string;
  assets: Partial<Record<"windows" | "windows-msi" | "addon", DownloadAsset>>;
};
export const WINDOWS_DOWNLOAD = "/download/windows";
export const ADDON_DOWNLOAD = "/download/addon";
