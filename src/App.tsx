import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Store, 
  ArrowRight, 
  Camera, 
  IdCard, 
  ChevronLeft, 
  Loader2, 
  CheckCircle2, 
  Trash2,
  AlertCircle,
  FileSpreadsheet,
  Lock,
  ImagePlus
} from "lucide-react";
import confetti from "canvas-confetti";
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';

type Screen = "auth" | "collect" | "success";

interface ImageData {
  gpkd: string | null;
  cccd: string | null;
}

interface OCRResult {
  gpkd: {
    licenseNum: string;
    businessName: string;
    allLines: string[];
  };
  cccd: {
    idNum: string;
    fullName: string;
    allLines: string[];
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [dmsCode, setDmsCode] = useState("");
  const [empId, setEmpId] = useState("");
  const [images, setImages] = useState<ImageData>({ gpkd: null, cccd: null });
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoType, setActivePhotoType] = useState<keyof ImageData | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [importPassword, setImportPassword] = useState("");

  // Import DMS Logic
  const handleImportDMSClick = () => {
    setShowPasswordPrompt(true);
    setImportPassword("");
  };

  const handlePasswordSubmit = () => {
    if (importPassword === "03042000") {
      setShowPasswordPrompt(false);
      excelInputRef.current?.click();
    } else {
      alert("Mật khẩu không đúng!");
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordPrompt(false);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
        
        // Flatten and filter empty
        const codes = json.flat().map(String).map(s => s.trim()).filter(s => s);
        
        if (codes.length === 0) {
          alert("Không tìm thấy mã DMS nào trong file Excel.");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/import-dms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes, password: "03042000" }),
        });
        
        const result = await res.json();
        if (result.success) {
          alert(result.message);
        } else {
          alert("Lỗi: " + result.message);
        }
      } catch (err) {
        alert("Có lỗi khi đọc file Excel.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // Reset input
  };

  // Screen 1: Auth Logic
  const handleAuth = async () => {
    if (!dmsCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/validate-dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dmsCode: String(dmsCode) }), // Ensure string
      });
      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error(`Mã lỗi máy chủ: ${res.status}. Vui lòng thử lại.`);
      }
      
      if (data.success) {
        setScreen("collect");
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || "Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  // Photo Handling
  const triggerCamera = (type: keyof ImageData) => {
    setActivePhotoType(type);
    fileInputRef.current?.click();
  };

  const triggerGallery = (type: keyof ImageData) => {
    setActivePhotoType(type);
    galleryInputRef.current?.click();
  };

  const compressImage = (base64Str: string, maxWidth = 1600, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePhotoType) return;

    setLoading(true); // Optional: show loading while compressing

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawBase64 = event.target?.result as string;
        const compressedBase64 = await compressImage(rawBase64, 1600, 0.7);
        setImages(prev => ({ ...prev, [activePhotoType]: compressedBase64 }));
      } catch (err) {
        console.error("Lỗi khi nén ảnh", err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Clear for next click
  };

  const removeImage = (type: keyof ImageData) => {
    setImages(prev => ({ ...prev, [type]: null }));
  };

  // Final Submission
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Initialize Gemini
      const genAI = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY || "" });
      
      const performOCR = async (base64: string | null, prompt: string) => {
        if (!base64) return null;
        const imageData = base64.split(",")[1];
        const res = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { data: imageData, mimeType: "image/jpeg" } }
            ]
          }
        });
        return res.text;
      };

      const gpkdPrompt = `Analyze this image of a Business Registration Certificate (Giấy phép kinh doanh). 
      Extract the following fields in JSON format:
      {
        "licenseNum": "The license number/business code",
        "businessName": "The official business name",
        "allLines": ["Array of all text lines read from image"]
      }
      Only return valid JSON. If not found, use "Not found".`;

      const cccdPrompt = `Analyze this image of a Vietnamese National ID Card (CCCD). 
      Extract the following fields in JSON format:
      {
        "idNum": "The 12-digit ID number",
        "fullName": "The person's full name",
        "allLines": ["Array of all text lines read from image"]
      }
      Only return valid JSON. If not found, use "Not found".`;

      const [gpkdRaw, cccdRaw] = await Promise.all([
        performOCR(images.gpkd, gpkdPrompt),
        performOCR(images.cccd, cccdPrompt)
      ]);

      const parseJSON = (text: string | null) => {
        if (!text) return null;
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (e) {
          return null;
        }
      };

      const gpkdData = parseJSON(gpkdRaw) || { licenseNum: "Error", businessName: "OCR Failed", allLines: [] };
      const cccdData = parseJSON(cccdRaw) || { idNum: "Error", fullName: "OCR Failed", allLines: [] };

      // 2. Submit results to backend (which saves to Supabase)
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmsCode,
          employeeId: empId,
          gpkdBase64: images.gpkd,
          cccdBase64: images.cccd,
          ocrData: {
            gpkd: gpkdData,
            cccd: cccdData
          }
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOcrResult(data.data);
        setScreen("success");
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Lỗi xử lý OCR hoặc gửi dữ liệu.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = empId.trim().length > 0 && images.gpkd && images.cccd;

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        capture="environment" 
        onChange={handleFileChange}
      />
      <input 
        type="file" 
        ref={galleryInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange}
      />

      {/* Top Header Bar */}
      <header className="h-14 bg-slate-900 flex items-center justify-between px-6 shrink-0 shadow-lg z-10 transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <span className="text-slate-50 font-bold tracking-tight uppercase text-sm">Field Data Collector v3.1</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 leading-none">System Status</p>
            <p className="text-[10px] text-emerald-400 font-mono font-bold">DMS-CONNECTED</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-white text-[10px] font-bold">ADMIN</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation / Status */}
        <aside className="w-64 bg-slate-100 border-r border-slate-200 hidden lg:flex flex-col p-4 space-y-6 shrink-0">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Session Tracking</label>
            <div className="mt-3 space-y-2">
              <div className={`flex items-center space-x-3 p-2 rounded-lg text-sm border transition-all ${
                screen === "auth" ? "bg-indigo-600 text-white shadow-md border-indigo-700 font-medium" : "bg-emerald-100 text-emerald-800 border-emerald-200"
              }`}>
                {screen === "auth" ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Xác thực DMS</span>
              </div>
              
              <div className={`flex items-center space-x-3 p-2 rounded-lg text-sm border transition-all ${
                screen === "collect" ? "bg-indigo-600 text-white shadow-md border-indigo-700 font-medium" : 
                screen === "success" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "text-slate-400 border-transparent"
              }`}>
                {screen === "collect" ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : screen === "success" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-slate-300" />
                )}
                <span>Thu thập dữ liệu</span>
              </div>

              <div className={`flex items-center space-x-3 p-2 rounded-lg text-sm transition-all ${
                screen === "success" ? "bg-indigo-600 text-white shadow-md font-medium" : "text-slate-400"
              }`}>
                <div className={`w-4 h-4 rounded-full ${screen === "success" ? "bg-white" : "bg-slate-300"}`} />
                <span>Xác nhận & Gửi</span>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-500 mb-4 uppercase tracking-wider">DMS CONTEXT</h4>
            <div className="space-y-4">
              <div className="border-l-2 border-indigo-500 pl-3 py-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight leading-none mb-1">Current Node</p>
                <p className="text-sm font-bold truncate">DMS_NODE_HCM_492</p>
              </div>
              <div className="border-l-2 border-slate-300 pl-3 py-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight leading-none mb-1">Session ID</p>
                <p className="text-[10px] font-mono text-slate-500">#GS-992381-TX</p>
              </div>
              {dmsCode && (
                <div className="border-l-2 border-emerald-500 pl-3 py-1 bg-emerald-50 rounded-r-md">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-tight leading-none mb-1">DMS Code</p>
                  <p className="text-xs font-bold text-emerald-800">{dmsCode}</p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center opacity-50">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">Vision OCR Engine Active</p>
            <p className="text-[9px] font-mono text-slate-400">Latency: 42ms</p>
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 relative">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {/* SCREEN 1: AUTH */}
              {screen === "auth" && (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 max-w-lg mx-auto"
                >
                  <div className="mb-10 text-center sm:text-left">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-3">Xác thực hệ thống</h1>
                    <p className="text-slate-500 text-sm">Vui lòng cung cấp mã DMS của cửa hàng để truy cập phiên làm việc hiện trường.</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1">Mã DMS cửa hàng</label>
                      <input
                        type="text"
                        value={dmsCode}
                        onChange={(e) => setDmsCode(e.target.value)}
                        placeholder="VD: HCM-902-X..."
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-lg placeholder:text-slate-300"
                        autoFocus
                      />
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold uppercase tracking-wide">
                        <AlertCircle size={16} />
                        {error}
                      </motion.div>
                    )}

                    <button
                      onClick={handleAuth}
                      disabled={loading || !dmsCode.trim()}
                      className="w-full h-18 bg-slate-900 disabled:bg-slate-200 hover:bg-slate-800 text-white rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-4"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <>Tiếp tục <ArrowRight size={18} /></>}
                    </button>
                    
                    {/* Nút Import DMS bằng Excel */}
                    <div className="pt-4 border-t border-slate-100 text-center">
                      <button
                        onClick={handleImportDMSClick}
                        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        <FileSpreadsheet size={16} />
                        Import mã DMS từ Excel
                      </button>
                      <input 
                        type="file" 
                        ref={excelInputRef} 
                        onChange={handleExcelUpload} 
                        accept=".xlsx, .xls, .csv" 
                        className="hidden" 
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SCREEN 2: DATA COLLECTION */}
              {screen === "collect" && (
                <motion.div
                  key="collect"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="space-y-8"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
                    <div>
                      <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Hệ thống thu thập hiện trường</h1>
                      <p className="text-slate-500 mt-2">Vui lòng cung cấp mã nhân viên và hình ảnh chứng thực để tiếp tục.</p>
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-200">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      DMS: {dmsCode}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Employee ID Card */}
                    <div className="md:col-span-12">
                      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm transition-all focus-within:ring-4 focus-within:ring-indigo-100 focus-within:border-indigo-500">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Mã nhân viên (Bắt buộc)</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={empId}
                            onChange={(e) => setEmpId(e.target.value)}
                            placeholder="EMP-DMS-2024-XXX"
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xl tracking-wide placeholder:text-slate-200"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-200">
                            <IdCard size={24} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Photo Action 1: GPKD */}
                    <div className="md:col-span-6 group">
                      <div className={`h-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center text-center transition-all ${images.gpkd ? "bg-indigo-50 border-indigo-200 ring-4 ring-indigo-50" : "hover:border-indigo-300"}`}>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all ${images.gpkd ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 group-hover:scale-110"}`}>
                          <Camera size={28} />
                        </div>
                        <h3 className="font-black text-sm uppercase tracking-widest mb-1 text-slate-900">GIẤY PHÉP KINH DOANH</h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-6 px-4">Chụp ảnh bản gốc rõ nét, đầy đủ thông tin pháp lý</p>
                        
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex flex-col items-center justify-center gap-3 overflow-hidden transition-all ${images.gpkd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.gpkd ? (
                            <>
                              <button 
                                onClick={() => triggerCamera("gpkd")}
                                className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-2.5 rounded-full shadow-sm border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"
                              >
                                <Camera size={14} /> Chụp ảnh
                              </button>
                              <button 
                                onClick={() => triggerGallery("gpkd")}
                                className="flex items-center gap-2 text-slate-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-2.5 rounded-full shadow-sm border border-slate-200 hover:bg-slate-800 hover:text-white transition-all transform hover:-translate-y-1"
                              >
                                <ImagePlus size={14} /> Thư viện
                              </button>
                            </>
                          ) : (
                            <>
                              <img src={images.gpkd} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <button onClick={() => removeImage("gpkd")} className="bg-red-500 text-white p-4 rounded-full shadow-xl transition-transform hover:scale-110">
                                  <Trash2 size={24} />
                                </button>
                              </div>
                              <div className="absolute top-2 right-2">
                                <span className="bg-emerald-500 text-white text-[8px] px-2 py-1 rounded-md font-black uppercase tracking-widest shadow-sm">VERIFIED</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Photo Action 2: CCCD */}
                    <div className="md:col-span-6 group">
                      <div className={`h-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center text-center transition-all ${images.cccd ? "bg-indigo-50 border-indigo-200 ring-4 ring-indigo-50" : "hover:border-indigo-300"}`}>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all ${images.cccd ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 group-hover:scale-110"}`}>
                          <IdCard size={28} />
                        </div>
                        <h3 className="font-black text-sm uppercase tracking-widest mb-1 text-slate-900">CĂN CƯỚC CÔNG DÂN</h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-6 px-4">Ảnh mặt trước căn cước chính chủ, không bị lóa</p>
                        
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex flex-col items-center justify-center gap-3 overflow-hidden transition-all ${images.cccd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.cccd ? (
                            <>
                              <button 
                                onClick={() => triggerCamera("cccd")}
                                className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-2.5 rounded-full shadow-sm border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"
                              >
                                <Camera size={14} /> Chụp ảnh
                              </button>
                              <button 
                                onClick={() => triggerGallery("cccd")}
                                className="flex items-center gap-2 text-slate-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-2.5 rounded-full shadow-sm border border-slate-200 hover:bg-slate-800 hover:text-white transition-all transform hover:-translate-y-1"
                              >
                                <ImagePlus size={14} /> Thư viện
                              </button>
                            </>
                          ) : (
                            <>
                              <img src={images.cccd} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <button onClick={() => removeImage("cccd")} className="bg-red-500 text-white p-4 rounded-full shadow-xl transition-transform hover:scale-110">
                                  <Trash2 size={24} />
                                </button>
                              </div>
                              <div className="absolute top-2 right-2">
                                <span className="bg-emerald-500 text-white text-[8px] px-2 py-1 rounded-md font-black uppercase tracking-widest shadow-sm">VERIFIED</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submission Footer */}
                  <div className="flex flex-col sm:flex-row justify-end items-center gap-6 pt-10 border-t border-slate-200">
                    <div className="text-center sm:text-right">
                      {!isFormValid ? (
                        <>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Hệ thống đang chờ</p>
                          <p className="text-xs text-red-500 font-bold italic">
                            {!empId.trim() ? "Vui lòng nhập Mã nhân viên" : !images.gpkd ? "Thiếu ảnh Giấy Phép Kinh Doanh" : "Thiếu ảnh Căn Cước Công Dân"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] mb-1">Dữ liệu sẵn sàng</p>
                          <p className="text-xs text-slate-500 font-medium italic">Sẵn nộp báo cáo OCR ngay lập tức</p>
                        </>
                      )}
                    </div>
                    <button 
                      onClick={handleSubmit} 
                      disabled={!isFormValid || loading}
                      className={`px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all active:scale-95 flex items-center gap-3 ${
                        isFormValid && !loading 
                          ? "bg-slate-900 text-white hover:bg-black shadow-2xl shadow-indigo-200" 
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {loading ? <Loader2 className="animate-spin" /> : "Kết thúc & Lưu dữ liệu"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* SCREEN 3: SUCCESS & OCR RESULTS */}
              {screen === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-3xl mx-auto py-6"
                >
                  <div className="bg-white rounded-[2rem] p-8 sm:p-12 border border-slate-200 shadow-2xl overflow-hidden">
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
                        <CheckCircle2 size={32} />
                      </div>
                      <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Quy trình hoàn tất!</h2>
                        <p className="text-slate-500 text-sm">Dữ liệu đã được lưu lên hệ thống Cloud.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                      {/* GPKD Results */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Camera size={16} className="text-indigo-500" />
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kết quả GPKD</h4>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                          <div className="mb-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Mã số thuế/GPKD</p>
                            <p className="text-sm font-bold text-indigo-600">{ocrResult?.gpkd.licenseNum}</p>
                          </div>
                          <div className="mb-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Tên đơn vị</p>
                            <p className="text-sm font-bold text-slate-800">{ocrResult?.gpkd.businessName}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Tất cả các dòng đọc được:</p>
                            <div className="max-h-40 overflow-y-auto bg-white/50 p-3 rounded-lg border border-slate-200 mt-2">
                              {ocrResult?.gpkd.allLines.map((line, i) => (
                                <p key={i} className="text-[10px] text-slate-600 mb-1 leading-relaxed border-b border-slate-50 last:border-0 pb-1">{line}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CCCD Results */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <IdCard size={16} className="text-indigo-500" />
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kết quả CCCD</h4>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                          <div className="mb-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Số căn cước</p>
                            <p className="text-sm font-bold text-indigo-600">{ocrResult?.cccd.idNum}</p>
                          </div>
                          <div className="mb-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Họ và tên</p>
                            <p className="text-sm font-bold text-slate-800 uppercase">{ocrResult?.cccd.fullName}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Tất cả các dòng đọc được:</p>
                            <div className="max-h-40 overflow-y-auto bg-white/50 p-3 rounded-lg border border-slate-200 mt-2">
                              {ocrResult?.cccd.allLines.map((line, i) => (
                                <p key={i} className="text-[10px] text-slate-600 mb-1 leading-relaxed border-b border-slate-50 last:border-0 pb-1">{line}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setScreen("auth");
                        setDmsCode("");
                        setEmpId("");
                        setImages({ gpkd: null, cccd: null });
                        setOcrResult(null);
                      }}
                      className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl hover:bg-black transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3"
                    >
                      Bắt đầu phiên mới <ArrowRight size={18} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-8 bg-slate-200 border-t border-slate-300 px-6 flex items-center justify-between text-[10px] text-slate-600 shrink-0 font-medium z-20">
        <div className="flex space-x-6">
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Google Cloud Vision: <span className="text-slate-900 font-bold uppercase">Operational</span>
          </span>
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Storage: <span className="text-slate-900 font-bold uppercase">84% Available</span>
          </span>
        </div>
        <div className="font-mono hidden sm:block">
          NODE_TIMESTAMP: {new Date().toISOString()}
        </div>
      </footer>

      {/* OCR PROCESSING MODAL */}
      {loading && screen !== "auth" && screen !== "success" && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-white px-6">
          <div className="relative mb-8">
            <Loader2 className="w-20 h-20 animate-spin text-indigo-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full animate-ping" />
            </div>
          </div>
          <h3 className="text-3xl font-black tracking-tight mb-2 uppercase">Analysis in progress</h3>
          <p className="text-indigo-200 text-sm font-bold uppercase tracking-widest opacity-80 mb-6">OCR ENGINE: Vision_v4_beta</p>
          <div className="w-full max-w-xs h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }} 
              animate={{ width: "100%" }} 
              transition={{ duration: 2, repeat: Infinity }}
              className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)]"
            />
          </div>
          <p className="mt-8 text-white/50 text-[10px] uppercase font-black tracking-[0.3em] text-center">Do not close window • Syncing with production drive</p>
        </div>
      )}

      {/* PASSWORD PROMPT MODAL */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-sm border border-slate-100"
          >
            <div className="flex items-center justify-center w-12 h-12 bg-slate-100 rounded-2xl mb-6 mx-auto">
              <Lock className="w-6 h-6 text-slate-700" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-1">Xác thực bắt buộc</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center mb-6">Nhập mật khẩu để import Excel</p>
            
            <input 
              type="password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full h-14 bg-slate-50 border border-slate-200 rounded-xl px-5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner mb-6 text-center tracking-widest"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasswordSubmit();
              }}
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={handlePasswordCancel}
                className="flex-1 h-12 text-sm font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handlePasswordSubmit}
                className="flex-1 h-12 text-sm font-bold uppercase tracking-wider text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
              >
                Xác nhận
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );

}
