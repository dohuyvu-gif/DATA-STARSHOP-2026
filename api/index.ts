import express from "express";
import cors from "cors";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: process.env.VERCEL ? "Vercel" : "Local" });
});

app.post("/api/validate-dms", (req, res) => {
  const { dmsCode } = req.body;
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
  
  if (!dmsCode || !employeeId || !gpkdBase64 || !cccdBase64) {
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc." });
  }

  try {
    // Giả lập xử lý OCR
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
    res.status(500).json({ success: false, message: "Lỗi nội bộ server." });
  }
});

// Export app cho Vercel Serverless Function
export default app;

// Chạy server truyền thống nếu không phải môi trường Vercel (dùng cho AI Studio/Local)
if (!process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Development server running on http://localhost:${PORT}`);
  });
}
