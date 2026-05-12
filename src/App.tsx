import React, { useState, useRef } from "react";
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
  Activity,
  Database,
  Wifi,
  Cpu
} from "lucide-react";
import confetti from "canvas-confetti";

type Screen = "auth" | "collect" | "success";

interface ImageData {
  gpkd: string | null;
  cccd: string | null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [dmsCode, setDmsCode] = useState("");
  const [empId, setEmpId] = useState("");
  const [images, setImages] = useState<ImageData>({ gpkd: null, cccd: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoType, setActivePhotoType] = useState<keyof ImageData | null>(null);

  const handleAuth = async () => {
    if (dmsCode.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/validate-dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dmsCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setScreen("collect");
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ API.");
    } finally {
      setLoading(false);
    }
  };

  const triggerCamera = (type: keyof ImageData) => {
    setActivePhotoType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePhotoType) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImages(prev => ({ ...prev, [activePhotoType]: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dmsCode, employeeId: empId, gpkdBase64: images.gpkd, cccdBase64: images.cccd }),
      });
      const data = await res.json();
      if (res.ok) {
        setScreen("success");
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      } else {
        setError(data.message || "Lỗi xử lý dữ liệu hiện trường.");
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans text-slate-900 flex flex-col">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />

      {/* HEADER V3.1 STYLE */}
      <header className="h-16 bg-[#001529] text-white flex items-center justify-between px-6 shadow-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#00A854] rounded-lg flex items-center justify-center">
            <Database size={18} className="text-white" />
          </div>
          <span className="font-black tracking-tighter text-lg">FIELD DATA COLLECTOR V3.1</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-right">System Status</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#00A854] font-bold">DMS-CONNECTED</span>
              <div className="w-2 h-2 bg-[#00A854] rounded-full animate-pulse"></div>
            </div>
          </div>
          <button className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700 px-3 py-1.5 rounded-full transition-colors border border-slate-700">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold">ADMIN</div>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR LIST */}
        <aside className="w-72 bg-white border-r border-slate-200 hidden lg:flex flex-col p-6 space-y-8 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Session Tracking</h3>
            <div className="space-y-4">
              <StepItem icon={<Wifi size={16} />} label="Xác thực DMS" active={screen === 'auth'} completed={screen !== 'auth'} />
              <StepItem icon={<Activity size={16} />} label="Thu thập dữ liệu" active={screen === 'collect'} completed={screen === 'success'} />
              <StepItem icon={<CheckCircle2 size={16} />} label="Xác nhận & Gửi" active={screen === 'success'} completed={false} />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">DMS Context</h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Current Node</span>
                <p className="text-sm font-black text-slate-800 uppercase">{dmsCode ? `DMS_NODE_${dmsCode}` : '--'}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Session ID</span>
                <p className="text-[10px] font-mono text-slate-500">#GS-992381-TX</p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
               <Cpu size={14} />
               <span className="text-[10px] font-black uppercase tracking-widest">Vision OCR Active</span>
            </div>
            <p className="text-[9px] text-slate-400 pl-7 leading-tight italic">Engine Latency: 42ms</p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto relative p-6 md:p-12 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {screen === "auth" && (
              <motion.div
                key="auth"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden"
              >
                <div className="p-12 md:p-20 flex flex-col items-center">
                  <header className="text-center mb-12">
                    <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">Xác thực hệ thống</h1>
                    <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">Vui lòng cung cấp mã DMS của cửa hàng để truy cập phiên làm việc hiện trường.</p>
                  </header>

                  <div className="w-full max-w-md space-y-6">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 text-center opacity-50">Mã DMS Cửa Hàng</h4>
                      <input
                        type="text"
                        value={dmsCode}
                        onChange={(e) => setDmsCode(e.target.value.toUpperCase())}
                        placeholder="Nhập mã DMS (VD: HCM, HN...)"
                        className="w-full h-20 px-8 bg-white border-2 border-slate-100 rounded-3xl text-xl font-black text-center focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 outline-none transition-all placeholder:text-slate-200 shadow-inner"
                      />
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-5 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100">
                        <AlertCircle size={20} /> {error}
                      </motion.div>
                    )}

                    <button
                      onClick={handleAuth}
                      disabled={loading || dmsCode.trim().length < 3}
                      className={`w-full h-20 rounded-3xl font-black text-xl tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 group shadow-lg ${
                        dmsCode.trim().length >= 3 
                          ? "bg-[#3D5AFE] text-white shadow-blue-500/20" 
                          : "bg-slate-100 text-slate-300 pointer-events-none"
                      }`}
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <>TIẾP TỤC <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {screen === "collect" && (
              <motion.div
                key="collect"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
              >
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
                   <div className="flex items-center gap-6">
                      <button onClick={() => setScreen("auth")} className="w-12 h-12 flex items-center justify-center hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors border border-slate-100">
                        <ChevronLeft size={24} />
                      </button>
                      <div>
                        <h2 className="text-2xl font-black tracking-tight">Thu thập hiện trường</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                           <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                           <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Active Node: {dmsCode}</span>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="p-8 md:p-12 grid md:grid-cols-2 gap-12 flex-1 scrollbar-hide overflow-y-auto">
                   <div className="space-y-8">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Thông tin nhân sự</h4>
                        <input
                          type="text"
                          value={empId}
                          onChange={(e) => setEmpId(e.target.value)}
                          placeholder="Nhập mã nhân viên..."
                          className="w-full h-16 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:bg-white focus:border-blue-500 outline-none transition-all"
                        />
                      </div>

                      <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-4">
                        <div className="flex items-center gap-3 text-blue-600">
                          <AlertCircle size={20} />
                          <span className="text-[10px] font-black uppercase tracking-wider">Lưu ý nghiệp vụ</span>
                        </div>
                        <p className="text-xs text-blue-800 leading-relaxed font-medium">
                          Vui lòng chuẩn bị sẵn giấy tờ gốc. Ảnh chụp cần bao phủ toàn bộ khung hình, không bị mất góc và đảm bảo độ sáng tốt nhất để hệ thống OCR bóc tách dữ liệu chính xác.
                        </p>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Tài liệu hồ sơ</h4>
                      
                      <div className="grid grid-cols-1 gap-4">
                        <PhotoUpload 
                          label="Giấy phép KD" 
                          tag="GPKD_REGISTRATION" 
                          icon={<Store />} 
                          image={images.gpkd} 
                          onUpload={() => triggerCamera('gpkd')} 
                          onRemove={() => setImages(p => ({...p, gpkd: null}))}
                        />
                        <PhotoUpload 
                          label="Căn cước công dân" 
                          tag="CCCD_IDENTITY" 
                          icon={<IdCard />} 
                          image={images.cccd} 
                          onUpload={() => triggerCamera('cccd')} 
                          onRemove={() => setImages(p => ({...p, cccd: null}))}
                        />
                      </div>
                   </div>
                </div>

                <div className="p-8 bg-white border-t border-slate-100 space-y-4">
                  {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-5 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100">
                      <AlertCircle size={20} className="shrink-0" /> {error}
                    </motion.div>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={!empId.trim() || !images.gpkd || !images.cccd || loading}
                    className={`w-full h-20 rounded-3xl font-black text-xl tracking-[0.3em] transition-all active:scale-[0.98] flex items-center justify-center shadow-lg ${
                      empId.trim() && images.gpkd && images.cccd
                        ? "bg-[#00A854] text-white shadow-green-200"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    {loading ? <Loader2 className="animate-spin" /> : "XÁC NHẬN & GỬI"}
                  </button>
                </div>
              </motion.div>
            )}

            {screen === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-xl bg-white p-12 md:p-20 rounded-[3rem] shadow-2xl text-center border border-slate-100"
              >
                <div className="w-24 h-24 bg-[#00A854] rounded-3xl flex items-center justify-center mx-auto mb-10 text-white shadow-xl shadow-green-200 rotate-6">
                  <CheckCircle2 size={56} />
                </div>
                <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tight">Xử lý thành công!</h2>
                <p className="text-slate-500 leading-relaxed max-w-xs mx-auto mb-12 font-medium">
                  Hồ sơ cho mã DMS <b>{dmsCode}</b> đã được hệ thống bóc tách và lưu trữ an toàn.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setScreen("auth");
                      setDmsCode("");
                      setEmpId("");
                      setImages({ gpkd: null, cccd: null });
                    }}
                    className="h-16 border-2 border-slate-100 hover:bg-slate-50 text-slate-900 rounded-3xl font-black transition-all"
                  >
                    QUAY LẠI
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="h-16 bg-slate-900 text-white rounded-3xl font-black hover:bg-black shadow-xl transition-all"
                  >
                    LÀM MỚI
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* FOOTER STATUS BAR */}
      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between text-[10px] font-black text-slate-400 z-20">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#00A854] rounded-full"></div>
            <span className="uppercase tracking-widest">Google Cloud Vision: OPERATIONAL</span>
          </div>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-8">
             <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
             <span className="uppercase tracking-widest text-[#3D5AFE]">Storage: 84% AVAILABLE</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <span className="uppercase tracking-widest text-[9px] opacity-70">NODE_TIMESTAMP: {new Date().toISOString()}</span>
        </div>
      </footer>
    </div>
  );
}

function StepItem({ icon, label, active, completed }: { icon: React.ReactNode, label: string, active: boolean, completed: boolean }) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${active ? 'bg-[#3D5AFE] text-white border-blue-600 shadow-xl shadow-blue-500/20' : 'bg-transparent border-transparent text-slate-400'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-white/20' : completed ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-slate-100'}`}>
        {completed ? <CheckCircle2 size={18} /> : icon}
      </div>
      <span className="text-sm font-black tracking-tight">{label}</span>
      {active && <motion.div layoutId="step-indicator" className="w-1.5 h-1.5 bg-white rounded-full ml-auto" />}
    </div>
  );
}

function PhotoUpload({ label, tag, icon, image, onUpload, onRemove }: { 
  label: string, 
  tag: string, 
  icon: React.ReactNode, 
  image: string | null, 
  onUpload: () => void, 
  onRemove: () => void 
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      {!image ? (
        <button
          onClick={onUpload}
          className="w-full h-40 bg-slate-50 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-400 group shadow-sm hover:shadow-md"
        >
          <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform border border-slate-100">
            {icon}
          </div>
          <span className="text-[11px] font-black uppercase tracking-tighter opacity-60">{tag}</span>
        </button>
      ) : (
        <div className="relative h-44 rounded-3xl overflow-hidden shadow-xl group border border-slate-200 bg-black/5">
          <img src={image} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
             <button onClick={onRemove} className="w-14 h-14 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl">
               <Trash2 size={24} />
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
