import { useState } from "react";
import { writeBatch, doc } from "firebase/firestore";
import { db } from "./firebase"; // Trỏ đến file firebase.ts vừa tạo
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
  FileText,
  User,
  Hash,
  Database
} from "lucide-react";
import confetti from "canvas-confetti";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Screen = "auth" | "collect" | "success";

interface ImageData {
  gpkd: string | null;
  cccd: string | null;
}
function ToolUploadDMS() {
  const [status, setStatus] = useState("");
  
  // Dán 16.000 mã vào đây
  const danhSachDMS = [
    "CT00009999", 
    "HCM_001",
    // ...
  ];

  const handleUploadHaoLoat = async () => {
    setStatus("Đang xử lý, vui lòng đợi...");
    try {
      const chunkSize = 500; 
      for (let i = 0; i < danhSachDMS.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = danhSachDMS.slice(i, i + chunkSize);
        chunk.forEach((maDMS) => {
          const docRef = doc(db, "DMS_Codes", maDMS.trim());
          batch.set(docRef, { isActive: true }); 
        });
        await batch.commit();
        setStatus(`Đang tải... ${Math.min(i + chunkSize, danhSachDMS.length)} / ${danhSachDMS.length}`);
      }
      setStatus("HOÀN TẤT! Đã đẩy xong 16.000 mã lên Firebase.");
    } catch (error) {
      console.error(error);
      setStatus("Có lỗi xảy ra, xem Console.");
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", margin: "20px" }}>
      <h3>Công cụ Admin: Đẩy Data DMS</h3>
      <button onClick={handleUploadHaoLoat} style={{ padding: "10px", background: "blue", color: "white" }}>
        Bấm để đưa 16.000 mã lên Cloud
      </button>
      <p>Trạng thái: <strong>{status}</strong></p>
    </div>
  );
}
export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [dmsCode, setDmsCode] = useState("");
  const [suggestions, setSuggestions] = useState<{code: string, name: string}[]>([]);
  const [isDmsVerified, setIsDmsVerified] = useState(false);
  const [empId, setEmpId] = useState("");
  const [images, setImages] = useState<ImageData>({ gpkd: null, cccd: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<{
    gpkd: { licenseNum: string; businessName: string };
    cccd: { idNum: string; fullName: string };
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoType, setActivePhotoType] = useState<keyof ImageData | null>(null);

  // DMS Search logic
  useEffect(() => {
    const searchDms = async () => {
      if (dmsCode.length < 2 || isDmsVerified) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/search-dms?q=${encodeURIComponent(dmsCode)}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Search error", err);
      }
    };

    const timer = setTimeout(searchDms, 300);
    return () => clearTimeout(timer);
  }, [dmsCode, isDmsVerified]);

  // Screen 1: Auth Logic
  const handleAuth = async () => {
    if (!dmsCode.trim() || !isDmsVerified) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/validate-dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dmsCode }),
      });
      const data = await res.json();
      if (data.success) {
        setScreen("collect");
      } else {
        setError(data.message);
        setIsDmsVerified(false);
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  const selectDms = (item: {code: string, name: string}) => {
    setDmsCode(item.code);
    setIsDmsVerified(true);
    setSuggestions([]);
  };

  const onDmsInputChange = (val: string) => {
    setDmsCode(val);
    setIsDmsVerified(false);
  };

  // Photo Handling
  const triggerCamera = (type: keyof ImageData) => {
    setActivePhotoType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePhotoType) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImages(prev => ({ ...prev, [activePhotoType]: base64 }));
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
      // 1. Thực hiện OCR thực tế bằng Gemini trên Frontend
      const promptGPKD = "Bạn là chuyên gia OCR. Hãy bóc tách 'Số giấy phép đăng ký kinh doanh' và 'Tên đăng ký kinh doanh' từ ảnh này. Trả về định dạng JSON: {licenseNum: string, businessName: string}. Không thêm text giải thích.";
      const promptCCCD = "Bạn là chuyên gia OCR. Hãy bóc tách 'Số căn cước công dân' (12 số) và 'Họ và tên' từ ảnh này. Trả về định dạng JSON: {idNum: string, fullName: string}. Không thêm text giải thích.";

      const [resGPKD, resCCCD] = await Promise.all([
        ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: promptGPKD },
              { inlineData: { data: images.gpkd!.split(',')[1], mimeType: "image/jpeg" } }
            ]
          },
          config: { responseMimeType: "application/json" }
        }),
        ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: promptCCCD },
              { inlineData: { data: images.cccd!.split(',')[1], mimeType: "image/jpeg" } }
            ]
          },
          config: { responseMimeType: "application/json" }
        })
      ]);

      const dataGPKD = JSON.parse(resGPKD.text || "{}");
      const dataCCCD = JSON.parse(resCCCD.text || "{}");
      
      setOcrResults({
        gpkd: { 
          licenseNum: dataGPKD.licenseNum || "Không rõ", 
          businessName: dataGPKD.businessName || "Không rõ" 
        },
        cccd: { 
          idNum: dataCCCD.idNum || "Không rõ", 
          fullName: dataCCCD.fullName || "Không rõ" 
        }
      });

      // 2. Gửi lệnh mô phỏng đến server
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmsCode,
          employeeId: empId,
          gpkdBase64: images.gpkd,
          cccdBase64: images.cccd
        }),
      });
      
      const data = await res.json();
      if (data.success) {
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
      console.error(err);
      setError("Lỗi xử lý OCR hoặc gửi dữ liệu. Thử lại sau.");
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
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 ml-1">Mã DMS cửa hàng</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={dmsCode}
                          onChange={(e) => onDmsInputChange(e.target.value)}
                          placeholder="Nhập mã DMS (VD: HCM, HN...)"
                          className={`w-full px-5 py-4 bg-slate-50 border rounded-2xl focus:ring-4 outline-none transition-all font-bold text-lg placeholder:text-slate-300 ${
                            isDmsVerified 
                              ? "border-emerald-500 ring-4 ring-emerald-50" 
                              : "border-slate-200 focus:ring-indigo-100 focus:border-indigo-500"
                          }`}
                          autoFocus
                        />
                        {isDmsVerified && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                            <CheckCircle2 size={24} />
                          </div>
                        )}
                      </div>

                      {/* Suggestions Dropdown */}
                      <AnimatePresence>
                        {suggestions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
                          >
                            <div className="p-2 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">
                              Kết quả tìm thấy ({suggestions.length})
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                              {suggestions.map((item) => (
                                <button
                                  key={item.code}
                                  onClick={() => selectDms(item)}
                                  className="w-full text-left px-5 py-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0 group"
                                >
                                  <div className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{item.code}</div>
                                  <div className="text-[11px] text-slate-400 font-bold uppercase">{item.name}</div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      {isDmsVerified && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 ml-1 text-[11px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-2">
                          <CheckCircle2 size={12} /> Đã chọn mã hợp lệ
                        </motion.p>
                      )}
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold uppercase tracking-wide">
                        <AlertCircle size={16} />
                        {error}
                      </motion.div>
                    )}

                    <button
                      onClick={handleAuth}
                      disabled={loading || !isDmsVerified}
                      className="w-full h-18 bg-slate-900 disabled:bg-slate-200 hover:bg-slate-800 text-white rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-4"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <>Tiếp tục <ArrowRight size={18} /></>}
                    </button>
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
                        
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex items-center justify-center overflow-hidden transition-all ${images.gpkd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.gpkd ? (
                            <button 
                              onClick={() => triggerCamera("gpkd")}
                              className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-3 rounded-full shadow-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"
                            >
                              Chụp ảnh ngay
                            </button>
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
                        
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex items-center justify-center overflow-hidden transition-all ${images.cccd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.cccd ? (
                            <button 
                              onClick={() => triggerCamera("cccd")}
                              className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-3 rounded-full shadow-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1"
                            >
                              Chụp ảnh ngay
                            </button>
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

              {/* SCREEN 3: SUCCESS */}
              {screen === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-2xl mx-auto py-8 w-full"
                >
                  <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center border border-slate-200 shadow-2xl overflow-hidden relative">
                    <div className="w-20 h-20 bg-emerald-50 rounded-2xl rotate-12 flex items-center justify-center mx-auto mb-6 text-emerald-500 shadow-lg border border-emerald-100">
                      <CheckCircle2 size={40} className="-rotate-12" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2 leading-tight">Quy trình hoàn tất!</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed max-w-sm mx-auto text-sm font-medium">
                      Hồ sơ cửa hàng <span className="text-slate-900 font-bold">{dmsCode}</span> đã được đẩy lên Google Drive và xử lý OCR thành công.
                    </p>

                    {/* OCR RESULTS BOX */}
                    <div className="bg-slate-50 rounded-3xl p-6 mb-8 text-left border border-slate-100">
                      <div className="flex items-center gap-2 mb-4">
                        <Database size={16} className="text-indigo-600" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Kết quả bóc tách (OCR Real-time)</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2 text-indigo-600">
                            <FileText size={14} />
                            <span className="text-[10px] font-bold uppercase">Giấy phép KD</span>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-none mb-1">Số giấy phép:</p>
                            <p className="text-sm font-black text-slate-800">{ocrResults?.gpkd.licenseNum}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-none mb-1">Tên đăng ký:</p>
                            <p className="text-sm font-black text-slate-800">{ocrResults?.gpkd.businessName}</p>
                          </div>
                        </div>

                        <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2 text-indigo-600">
                            <User size={14} />
                            <span className="text-[10px] font-bold uppercase">Căn cước công dân</span>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-none mb-1">Mã số định danh:</p>
                            <p className="text-sm font-black text-slate-800">{ocrResults?.cccd.idNum}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-none mb-1">Họ và tên:</p>
                            <p className="text-sm font-black text-slate-800">{ocrResults?.cccd.fullName}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-indigo-600 text-white rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database size={14} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">Trạng thái Google Sheets</span>
                        </div>
                        <span className="text-[9px] font-black uppercase bg-white/20 px-2 py-0.5 rounded">Đã Append Row</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setScreen("auth");
                        setDmsCode("");
                        setEmpId("");
                        setImages({ gpkd: null, cccd: null });
                        setIsDmsVerified(false);
                        setOcrResults(null);
                      }}
                      className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl hover:bg-black transition-all transform hover:-translate-y-1"
                    >
                      Bắt đầu phiên nộp mới
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
      <ToolUploadDMS />
    </div>
  );

}
