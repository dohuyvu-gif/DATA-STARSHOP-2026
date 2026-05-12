import express from "express";
import cors from "cors";
import { google } from "googleapis";
import axios from "axios";
import { Readable } from "stream";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper: Get Google Auth Client
const getAuthClient = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error("Thiếu biến môi trường: Vui lòng cấu hình GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_PRIVATE_KEY trong mục Secrets.");
  }

  // Kiểm tra định dạng key
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Định dạng GOOGLE_PRIVATE_KEY không hợp lệ. Bạn đang dán mã ID thay vì nôi dung Private Key (phải bắt đầu bằng -----BEGIN PRIVATE KEY-----).");
  }

  key = key.replace(/\\n/g, '\n');

  return new google.auth.JWT(
    email,
    null,
    key,
    ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
  );
};

// Helper: Save Base64 to Drive
const saveToDrive = async (base64: string, fileName: string, folderId: string) => {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const contentType = base64.substring(5, base64.indexOf(';'));
  const base64Data = base64.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: contentType
    },
    media: {
      mimeType: contentType,
      body: stream
    }
  });

  return response.data;
};

// Helper: OCR via Vision API
const performOCR = async (base64: string) => {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return "API Key vision missing";

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const base64Data = base64.split(',')[1];

  const payload = {
    requests: [{
      image: { content: base64Data },
      features: [{ type: "TEXT_DETECTION" }]
    }]
  };

  try {
    const response = await axios.post(url, payload);
    const result = response.data;
    if (result.responses?.[0]?.fullTextAnnotation) {
      return result.responses[0].fullTextAnnotation.text;
    }
    return "";
  } catch (error) {
    console.error("Vision API Error:", error);
    return "";
  }
};

// Logic bóc tách dữ liệu (tương tự Code.gs)
function extractGPKD(text: string) {
  const licenseMatch = text.match(/(?:Số|No)\s*[:.]?\s*(\d{8,14})/i);
  const nameMatch = text.match(/(?:TÊN\s+(?:CÔNG|DOANH)\s+(?:TY|NGHIỆP)|Tên\s+đăng\s+ký)\s*[:.]?\s*([^\n\r]+)/i);
  return {
    licenseNum: licenseMatch ? licenseMatch[1].trim() : "N/A",
    businessName: nameMatch ? nameMatch[1].trim() : "N/A"
  };
}

function extractCCCD(text: string) {
  const idMatch = text.match(/(?:\d{12})/);
  const nameMatch = text.match(/(?:Họ và tên|Full name)\s*[:.]?\s*([^\n\r]+)/i);
  return {
    idNum: idMatch ? idMatch[0] : "N/A",
    fullName: nameMatch ? nameMatch[1].trim() : "N/A"
  };
}

// Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    integrated: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  });
});

app.post("/api/validate-dms", (req, res) => {
  const { dmsCode } = req.body;
  if (dmsCode && dmsCode.trim().length >= 3) {
    return res.json({ success: true });
  } else {
    return res.status(400).json({ success: false, message: "Mã DMS không hợp lệ." });
  }
});

app.post("/api/submit", async (req, res) => {
  const { dmsCode, employeeId, gpkdBase64, cccdBase64 } = req.body;
  
  if (!dmsCode || !employeeId || !gpkdBase64 || !cccdBase64) {
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu." });
  }

  try {
    // 1. Lưu Drive
    const folderGpkd = process.env.FOLDER_GPKD_ID || "1UF2tMEB0v2BjVYyKxFeGIGXrnAOizLbJ";
    const folderCccd = process.env.FOLDER_CCCD_ID || "1uJZFafbPZ_WFOF-Dplykp9f9jCWlf0YD";

    const [gpkdFile, cccdFile] = await Promise.all([
      saveToDrive(gpkdBase64, `${dmsCode}_GPKD_${Date.now()}`, folderGpkd),
      saveToDrive(cccdBase64, `${dmsCode}_CCCD_${Date.now()}`, folderCccd)
    ]);

    // 2. OCR (Nếu có Vision API Key)
    const [gpkdText, cccdText] = await Promise.all([
      performOCR(gpkdBase64),
      performOCR(cccdBase64)
    ]);

    const gpkdData = extractGPKD(gpkdText);
    const cccdData = extractCCCD(cccdText);

    // 3. Lưu Google Sheets
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.SHEET_ID || "18AE2uGRNiMLFkhm-MXNFo4nv6thXD7HSLAGW7ay2XFA";

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'REPORT!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          dmsCode,
          employeeId,
          gpkdData.licenseNum,
          gpkdData.businessName,
          cccdData.idNum,
          cccdData.fullName,
          new Date().toLocaleString('vi-VN')
        ]]
      }
    });

    res.json({ 
      success: true, 
      message: "Dữ liệu đã được lưu thành công vào Google Drive & Sheets!",
      ocr: { gpkdData, cccdData }
    });

  } catch (error: any) {
    console.error("Integration Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Lỗi tích hợp Google API: " + (error.message || "Unknown error"),
      details: "Vui lòng kiểm tra file .env hoặc credentials của Service Account."
    });
  }
});

export default app;

if (!process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Development server running on http://localhost:${PORT}`);
  });
}
