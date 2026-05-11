import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  
  // Request logger helper
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API: Validate DMS Code
  app.post("/api/validate-dms", (req, res) => {
    const { dmsCode } = req.body;
    console.log(`Validating DMS: ${dmsCode}`);
    
    // Simulation: Any code >= 3 chars is valid
    if (dmsCode && dmsCode.length >= 3) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, message: "Mã DMS không hợp lệ (ít nhất 3 ký tự)." });
    }
  });

  // API: Process Submission (OCR Simulation)
  app.post("/api/submit", async (req, res) => {
    const { dmsCode, employeeId, gpkdBase64, cccdBase64 } = req.body;
    
    console.log(`Processing submission for DMS: ${dmsCode}, Emp: ${employeeId}`);
    
    if (!dmsCode || !employeeId || !gpkdBase64 || !cccdBase64) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc (mã DMS, mã NV hoặc ảnh)." });
    }

    try {
      // Simulation of OCR/Save delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      res.json({ 
        success: true, 
        message: "Dữ liệu đã được lưu thành công vào Google Drive & Sheets!",
        data: {
          gpkd: { licenseNum: "0123456789", businessName: `CÔNG TY TNHH DMS ${dmsCode}` },
          cccd: { idNum: "079012345678", fullName: "NGUYỄN VĂN A" }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Lỗi xử lý OCR trên server." });
    }
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
