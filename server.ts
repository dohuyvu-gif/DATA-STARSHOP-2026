import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHEET_ID = "1GSSVla9O1KocZpz4A8yaTuX6EUyurxgeiu9ITqptpmE";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=DMS_LIST`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Function to fetch DMS data from Google Sheets
  async function getDmsFromSheet() {
    try {
      const response = await axios.get(SHEET_URL);
      const records = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
      });
      // Giả sử cột A là "Mã DMS" và cột B là "Tên Cửa Hàng" (hoặc tên tương ứng trong file)
      // Chúng ta sẽ map lại để chuẩn hóa key
      return records.map((row: any) => {
        const keys = Object.keys(row);
        return {
          code: row[keys[0]]?.toString().toUpperCase().trim() || "",
          name: row[keys[1]]?.toString().trim() || "Cửa hàng chưa đặt tên"
        };
      }).filter((item: any) => item.code !== "");
    } catch (error) {
      console.error("Error fetching sheet:", error);
      return [];
    }
  }

  // API: Search DMS Codes (Fetched from Sheet)
  app.get("/api/search-dms", async (req, res) => {
    const q = (req.query.q as string || "").toUpperCase();
    if (q.length < 2) return res.json([]);
    
    const dmsList = await getDmsFromSheet();
    const matches = dmsList.filter((item: any) => 
      item.code.includes(q) || item.name.toUpperCase().includes(q)
    );
    res.json(matches);
  });

  // API: Validate DMS Code
  app.post("/api/validate-dms", async (req, res) => {
    const { dmsCode } = req.body;
    const dmsList = await getDmsFromSheet();
    const exists = dmsList.find((item: any) => item.code === dmsCode.toUpperCase());
    
    if (exists) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, message: "Mã DMS không tồn tại trong danh sách dữ liệu Sheet." });
    }
  });

  // API: Process Submission (OCR Simulation)
  app.post("/api/submit", async (req, res) => {
    const { dmsCode, employeeId, gpkdBase64, cccdBase64 } = req.body;
    
    // In a real scenario, you would use:
    // 1. Google Drive API to save files
    // 2. Google Cloud Vision API for OCR
    // 3. Google Sheets API to append rows
    
    console.log(`Processing submission for DMS: ${dmsCode}, Emp: ${employeeId}`);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulation of OCR results
    res.json({ 
      success: true, 
      message: "Dữ liệu đã được lưu thành công vào Google Drive & Sheets!",
      data: {
        gpkd: { licenseNum: "0123456789", businessName: `DMS STORE ${dmsCode}` },
        cccd: { idNum: "079012345678", fullName: "NGUYEN VAN A" }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
