import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase
// Use service role key on backend to bypass RLS if needed, or anon key with restricted RLS
const supabaseUrlRaw = process.env.SUPABASE_URL || "";
// Ensure the URL is clean (some users accidentally add /rest/v1 or trailing slashes)
const supabaseUrl = supabaseUrlRaw.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

if (supabase) {
  console.log(`Supabase client initialized with URL: ${supabaseUrl}`);
} else {
  console.log("Supabase client not initialized. Check your environment variables.");
}

let IN_MEMORY_DMS_CODES: string[] = [];

// ... Các API sẽ được định nghĩa trên "app" thay vì trong "startServer"
const app = express();
// Vercel serverless functions already parse req.body automatically.
// Running express.json() might hang if the stream is already consumed.
app.use((req, res, next) => {
  if (process.env.VERCEL === '1') {
    // Vercel handles body parsing internally
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});

// API: Import DMS Codes
app.post("/api/import-dms", async (req, res) => {
  const codes = req.body?.codes;
  const password = req.body?.password;
  
  if (password !== "03042000") {
    return res.status(401).json({ success: false, message: "Mật khẩu không đúng!" });
  }

  if (!codes || !Array.isArray(codes)) {
    return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ." });
  }

  try {
    if (supabase) {
      // Insert into valid_dms, ignore conflicts if they exist
      const insertData = codes.map(c => ({ code: String(c).trim() }));
      const { error } = await supabase.from('valid_dms').upsert(insertData, { onConflict: 'code' });
      
      if (error) {
        console.error("Lỗi khi import vào Supabase:", error);
        // Fallback to memory
        IN_MEMORY_DMS_CODES = [...new Set([...IN_MEMORY_DMS_CODES, ...codes.map(c => String(c).trim())])];
      }
    } else {
      // Fallback to memory
      IN_MEMORY_DMS_CODES = [...new Set([...IN_MEMORY_DMS_CODES, ...codes.map(c => String(c).trim())])];
    }

    res.json({ success: true, message: `Đã import thành công ${codes.length} mã DMS!` });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Đã xảy ra lỗi khi import." });
  }
});

// API: Validate DMS Code
app.post("/api/validate-dms", async (req, res) => {
  const dmsCode = req.body?.dmsCode;
  
  if (!dmsCode) {
    return res.status(400).json({ success: false, message: "Vui lòng nhập Mã DMS." });
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('valid_dms')
        .select('code')
        .eq('code', dmsCode.trim())
        .single();
        
      if (data) {
        return res.json({ success: true });
      }
      
      // If query doesn't match, maybe it's in the fallback memory array
      if (IN_MEMORY_DMS_CODES.includes(dmsCode.trim())) {
        return res.json({ success: true });
      }

      return res.status(400).json({ success: false, message: "Mã DMS không hợp lệ ! Mã này không có trong danh sách." });
    } else {
      if (IN_MEMORY_DMS_CODES.includes(dmsCode.trim())) {
        return res.json({ success: true });
      }
      return res.status(400).json({ success: false, message: "Mã DMS không hợp lệ ! Mã này không có trong danh sách." });
    }
  } catch(err: any) {
    if (dmsCode && IN_MEMORY_DMS_CODES.includes(String(dmsCode).trim())) {
       return res.json({ success: true });
    }
    return res.status(500).json({ success: false, message: "Lỗi kết nối máy chủ xác thực." });
  }
});

// API: Process Submission
app.post("/api/submit", async (req, res) => {
  const { dmsCode, employeeId, gpkdBase64, cccdBase64, ocrData } = req.body || {};
  
  console.log(`Saving submission for DMS: ${dmsCode}, Emp: ${employeeId}`);
  
  try {
    // Save to Supabase if configured
    if (supabase) {
      let gpkdUrl = null;
      let cccdUrl = null;

      const getUniqueFileName = async (baseName: string) => {
        if (!supabase) return `${baseName}.jpg`;
        const { data, error } = await supabase.storage.from("images").list("", {
          search: baseName,
        });
        if (error || !data) return `${baseName}.jpg`;
        
        const existing = data.map(f => f.name);
        let n = 0;
        while (true) {
          const fileName = n === 0 ? `${baseName}.jpg` : `${baseName}.${n}.jpg`;
          if (!existing.includes(fileName)) return fileName;
          n++;
          if (n > 100) return `${baseName}.${Date.now()}.jpg`; // fail-safe
        }
      };

      // Upload GPKD Image
      if (gpkdBase64) {
        const baseName = `${dmsCode}&${ocrData.gpkd.licenseNum}`;
        const gpkdName = await getUniqueFileName(baseName);
        const base64Data = gpkdBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const { data, error } = await supabase.storage
          .from("images")
          .upload(gpkdName, buffer, { contentType: "image/jpeg", upsert: false });
          
        if (error) console.error("GPKD Upload Error", error);
        else gpkdUrl = data?.path;
      }

      // Upload CCCD Image
      if (cccdBase64) {
        const baseName = `${dmsCode}&${ocrData.cccd.idNum}`;
        const cccdName = await getUniqueFileName(baseName);
        const base64Data = cccdBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const { data, error } = await supabase.storage
          .from("images")
          .upload(cccdName, buffer, { contentType: "image/jpeg", upsert: false });
          
        if (error) console.error("CCCD Upload Error", error);
        else cccdUrl = data?.path;
      }

      const { error } = await supabase.from('submissions').insert({
        dms_code: dmsCode,
        employee_id: employeeId,
        gpkd_license_num: ocrData.gpkd.licenseNum,
        gpkd_business_name: ocrData.gpkd.businessName,
        cccd_id_num: ocrData.cccd.idNum,
        cccd_full_name: ocrData.cccd.fullName,
        raw_ocr_gpkd: ocrData.gpkd.allLines.join('\n'),
        raw_ocr_cccd: ocrData.cccd.allLines.join('\n'),
        gpkd_image_url: gpkdUrl,
        cccd_image_url: cccdUrl
      });

      if (error) {
        console.error("Supabase Insert Error:", JSON.stringify(error));
        return res.status(500).json({ success: false, message: "Lỗi Supabase (SQL/RLS/Keys): " + JSON.stringify(error) });
      }
    } else {
      console.warn("Supabase not configured. Data not saved to cloud.");
    }

    res.json({ 
      success: true, 
      message: "Dữ liệu đã được lưu thành công!",
      data: ocrData
    });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).json({ success: false, message: "Lỗi lưu dữ liệu lên máy chủ." });
  }
});

// Chỉ tự động mở PORT nếu chạy ở dạng standalone / AI Studio / Local (không phải Vercel)
if (process.env.VERCEL !== '1') {
  async function startServer() {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
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

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  startServer();
}

// Export API Router/App cho Vercel chạy
export default app;
