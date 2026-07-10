import axios from "axios";

type MarksheetFile = {
  name: string;
  mimeType: string;
  data: string; // base64
};

export type ScannedStudent = {
  roll_number: string;
  name: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  confidence: number;
  source_file: string;
  warnings: string[];
};

export async function scanMarksheetOCR(file: MarksheetFile): Promise<ScannedStudent> {
  try {
    const { data } = await axios.post("http://127.0.0.1:5000/internal/ocr", file, { timeout: 30000 });
    return data;
  } catch (err: any) {
    throw new Error(err.response?.data?.detail || err.message || "OCR scanning failed");
  }
}
