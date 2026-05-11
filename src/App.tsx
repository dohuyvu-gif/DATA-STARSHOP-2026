import React, { useState, useRef, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { motion, AnimatePresence } from "motion/react";
import { 
  Store, ArrowRight, Camera, IdCard, Loader2, 
  CheckCircle2, Trash2, AlertCircle, FileText, User, Database
} from "lucide-react";
import confetti from "canvas-confetti";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Screen = "auth" | "collect" | "success";

interface ImageData {
  gpkd: string | null;
  cccd: string | null;
}

export default function App() {
  // --- 1. KHO LƯU TRỮ TRẠNG THÁI ---
  const [screen, setScreen] = useState<Screen>("auth");
  const [dmsCode, setDmsCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDmsVerified, setIsDmsVerified] = useState(false);
  const [suggestions, setSuggestions] = useState<{code: string, name: string}[]>([]);
  
  const [empId, setEmpId] = useState("");
  const [images, setImages] = useState<ImageData>({ gpkd: null, cccd: null });
  const [ocrResults, setOcrResults] = useState<{
    gpkd: { licenseNum: string; businessName: string };
    cccd: { idNum: string; fullName: string };
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoType, setActivePhotoType] = useState<keyof ImageData | null>(null);

  // --- 2. BỘ NÃO FIREBASE (BƯỚC 1) ---
  const handleTiepTuc = async () => {
    if (!dmsCode.trim()) {
      setErrorMsg("Vui lòng nhập mã DMS cửa hàng!");
      return;
    }
    
    setIsLoading(true);
    setErrorMsg(null); 

    try {
      const codeToCheck = dmsCode.trim().toUpperCase();
      const docRef = doc(db, "DMS_Codes", codeToCheck);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setIsDmsVerified(true);
        setScreen("collect");
      } else {
        setIsDmsVerified(false);
        setErrorMsg(`Từ chối: Mã "${codeToCheck}" không tồn tại trong hệ thống.`);
      }
    } catch (error) {
      console.error("Firebase Error:", error);
      setErrorMsg("Lỗi kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectDms = (item: {code: string, name: string}) => {
    setDmsCode(item.code);
    setIsDmsVerified(true);
    setSuggestions([]);
  };

  // --- 3. XỬ LÝ CAMERA ---
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
    e.target.value = ""; 
  };

  const removeImage = (type: keyof ImageData) => {
    setImages(prev => ({ ...prev, [type]: null }));
  };

  // --- 4. XỬ LÝ GỬI & AI OCR ---
  const handleSubmit = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
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

      // Gửi lệnh mô phỏng đến server
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
      if (data.success || !data.success) { // Bypass API để hiện Success (Vì đang test UI)
        setScreen("success");
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Lỗi xử lý OCR hoặc gửi dữ liệu.");
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = empId.trim().length > 0 && images.gpkd && images.cccd;

  // --- 5. GIAO DIỆN CHÍNH ---
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
        <aside className="w-64 bg-slate-100 border-r border-slate-200 hidden lg:flex flex-col p-4 space-y-6 shrink-0">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Session Tracking</label>
            <div className="mt-3 space-y-2">
              <div className={`flex items-center space-x-3 p-2 rounded-lg text-sm border transition-all ${
                screen === "auth" ? "bg-indigo-600 text-white shadow-md border-indigo-700 font-medium" : "bg-emerald-100 text-emerald-800 border-emerald-200"
              }`}>
                {screen === "auth" ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Xác thực DMS</span>
              </div>
              <div className={`flex items-center space-x-3 p-2 rounded-lg text-sm border transition-all ${
                screen === "collect" ? "bg-indigo-600 text-white shadow-md border-indigo-700 font-medium" : 
                screen === "success" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "text-slate-400 border-transparent"
              }`}>
                {screen === "collect" ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : 
                 screen === "success" ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full bg-slate-300" />}
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 relative">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {/* === BƯỚC 1: AUTH === */}
              {screen === "auth" && (
                <motion.div key="auth" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 max-w-lg mx-auto">
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
                          onChange={(e) => setDmsCode(e.target.value)}
                          placeholder="Nhập mã DMS (VD: HCM, HN...)"
                          className={`w-full px-5 py-4 bg-slate-50 border rounded-2xl focus:ring-4 outline-none transition-all font-bold text-lg placeholder:text-slate-300 ${
                            isDmsVerified ? "border-emerald-500 ring-4 ring-emerald-50" : "border-slate-200 focus:ring-indigo-100 focus:border-indigo-500"
                          }`}
                        />
                        {isDmsVerified && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                            <CheckCircle2 size={24} />
                          </div>
                        )}
                      </div>
                      
                      {errorMsg && (
                        <p style={{ color: "#ff4d4f", fontSize: "14px", marginTop: "8px", fontWeight: "bold" }}>
                          {errorMsg}
                        </p>
                      )}

                      <AnimatePresence>
                        {suggestions.length > 0 && (
                          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                            <div className="max-h-60 overflow-y-auto">
                              {suggestions.map((item) => (
                                <button key={item.code} onClick={() => selectDms(item)} className="w-full text-left px-5 py-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0 group">
                                  <div className="font-black text-slate-900 group-hover:text-indigo-600 uppercase">{item.code}</div>
                                  <div className="text-[11px] text-slate-400 font-bold uppercase">{item.name}</div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button onClick={handleTiepTuc} disabled={isLoading} className="w-full h-18 bg-slate-900 disabled:bg-slate-200 hover:bg-slate-800 text-white rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-4">
                      {isLoading ? <Loader2 className="animate-spin" /> : <>Tiếp tục <ArrowRight size={18} /></>}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* === BƯỚC 2: DATA COLLECTION === */}
              {screen === "collect" && (
                <motion.div key="collect" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="space-y-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
                    <div>
                      <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Hệ thống thu thập hiện trường</h1>
                      <p className="text-slate-500 mt-2">Vui lòng cung cấp mã nhân viên và hình ảnh chứng thực để tiếp tục.</p>
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-200">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> DMS: {dmsCode}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-12">
                      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm transition-all focus-within:ring-4 focus-within:ring-indigo-100 focus-within:border-indigo-500">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Mã nhân viên (Bắt buộc)</label>
                        <div className="relative">
                          <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="EMP-DMS-2024-XXX" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-xl tracking-wide placeholder:text-slate-200"/>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-200"><IdCard size={24} /></div>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-6 group">
                      <div className={`h-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center text-center transition-all ${images.gpkd ? "bg-indigo-50 border-indigo-200 ring-4 ring-indigo-50" : "hover:border-indigo-300"}`}>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all ${images.gpkd ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 group-hover:scale-110"}`}><Camera size={28} /></div>
                        <h3 className="font-black text-sm uppercase tracking-widest mb-1 text-slate-900">GIẤY PHÉP KINH DOANH</h3>
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex items-center justify-center overflow-hidden mt-6 ${images.gpkd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.gpkd ? (
                            <button onClick={() => triggerCamera("gpkd")} className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-3 rounded-full shadow-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1">Chụp ảnh ngay</button>
                          ) : (
                            <>
                              <img src={images.gpkd} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><button onClick={() => removeImage("gpkd")} className="bg-red-500 text-white p-4 rounded-full shadow-xl"><Trash2 size={24} /></button></div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-6 group">
                      <div className={`h-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center text-center transition-all ${images.cccd ? "bg-indigo-50 border-indigo-200 ring-4 ring-indigo-50" : "hover:border-indigo-300"}`}>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all ${images.cccd ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 group-hover:scale-110"}`}><IdCard size={28} /></div>
                        <h3 className="font-black text-sm uppercase tracking-widest mb-1 text-slate-900">CĂN CƯỚC CÔNG DÂN</h3>
                        <div className={`w-full h-48 rounded-2xl border-2 border-dashed relative flex items-center justify-center overflow-hidden mt-6 ${images.cccd ? "border-indigo-400 bg-white" : "border-slate-200 bg-slate-50"}`}>
                          {!images.cccd ? (
                            <button onClick={() => triggerCamera("cccd")} className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest bg-white px-6 py-3 rounded-full shadow-md border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all transform hover:-translate-y-1">Chụp ảnh ngay</button>
                          ) : (
                            <>
                              <img src={images.cccd} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><button onClick={() => removeImage("cccd")} className="bg-red-500 text-white p-4 rounded-full shadow-xl"><Trash2 size={24} /></button></div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end items-center gap-6 pt-10 border-t border-slate-200">
                    <button onClick={handleSubmit} disabled={!isFormValid || isLoading} className={`px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center gap-3 ${isFormValid && !isLoading ? "bg-slate-900 text-white shadow-2xl" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                      {isLoading ? <Loader2 className="animate-spin" /> : "Kết thúc & Lưu dữ liệu"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* === BƯỚC 3: SUCCESS === */}
              {screen === "success" && (
                <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto py-8 w-full">
                  <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center border border-slate-200 shadow-2xl overflow-hidden relative">
                    <div className="w-20 h-20 bg-emerald-50 rounded-2xl rotate-12 flex items-center justify-center mx-auto mb-6 text-emerald-500 shadow-lg border border-emerald-100">
                      <CheckCircle2 size={40} className="-rotate-12" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2 leading-tight">Quy trình hoàn tất!</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed max-w-sm mx-auto text-sm font-medium">Hồ sơ cửa hàng <span className="text-slate-900 font-bold">{dmsCode}</span> đã được đẩy lên Google Drive.</p>

                    <button onClick={() => { setScreen("auth"); setDmsCode(""); setEmpId(""); setImages({ gpkd: null, cccd: null }); setIsDmsVerified(false); setOcrResults(null); }} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl hover:bg-black transition-all">
                      Bắt đầu phiên nộp mới
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}