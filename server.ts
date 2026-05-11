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
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  // Request logger helper
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // --- API ROUTES ---
  
  app.get("/api/health", (req, res) => {
    console.log("Health check hit");
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.post("/api/validate-dms", (req, res) => {
    const { dmsCode } = req.body;
    console.log(`[API] Validate DMS: "${dmsCode}"`);
    
    if (dmsCode && dmsCode.trim().length >= 3) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Mã DMS không hợp lệ. Vui lòng nhập ít nhất 3 ký tự." 
      });
    }
  });

  app.post("/api/submit", async (req, res) => {
    const { dmsCode, employeeId, gpkdBase64, cccdBase64 } = req.body;
    console.log(`[API] Submit: DMS=${dmsCode}, Emp=${employeeId}`);
    
    if (!dmsCode || !employeeId || !gpkdBase64 || !cccdBase64) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc." });
    }

    try {
      // Simulation delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      res.json({ 
        success: true, 
        message: "Dữ liệu đã được lưu thành công!",
        data: {
          gpkd: { licenseNum: "0123456789", businessName: `CÔNG TY DMS ${dmsCode}` },
          cccd: { idNum: "079012345678", fullName: "NGUYỄN VĂN A" }
        }
      });
    } catch (error) {
      console.error("Submit error:", error);
      res.status(500).json({ success: false, message: "Lỗi nội bộ server." });
    }
  });

  // Catch-all for API that didn't match above
  app.all("/api/*", (req, res) => {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Endpoint not found", path: req.url });
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
