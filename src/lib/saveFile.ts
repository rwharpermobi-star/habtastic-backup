import { Capacitor } from '@capacitor/core';

export interface SavedFileResult {
  filename: string;
  /** Human-readable location shown to the user */
  location: string;
  platform: 'web' | 'native';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Web: download through the browser. Native: show Android's share/save sheet
 * so users can choose Downloads, Drive, or another destination explicitly.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SavedFileResult> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { filename, location: "your browser's Downloads folder (or the location you choose in its prompt)", platform: 'web' };
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  const { Share } = await import('@capacitor/share');
  await Share.share({
    title: `Save ${filename}`,
    text: `Choose where to save your HabTastic export: ${filename}`,
    files: [written.uri],
    dialogTitle: 'Save HabTastic export',
  });
  return { filename, location: 'the destination you choose in the Android share/save menu', platform: 'native' };
}
