import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API: Validate DMS Code
  app.post("/api/validate-dms", (req, res) => {
    const { dmsCode } = req.body;
    // Simulation: Any code >= 3 chars is valid
    if (dmsCode && dmsCode.length >= 3) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, message: "Mã DMS không hợp lệ hoặc không tồn tại." });
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
