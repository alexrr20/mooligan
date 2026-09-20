import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

export async function readDocument(maxBytes: number) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    if (file.size > maxBytes)
      throw new Error(`Choose a file smaller than ${Math.ceil(maxBytes / 1_000_000)} MB.`);
    return await file.text();
  } finally {
    if (file.exists) file.delete();
  }
}
export async function shareDocument(name: string, contents: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  file.write(contents);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      UTI: mimeType === "application/json" ? "public.json" : "public.plain-text",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
