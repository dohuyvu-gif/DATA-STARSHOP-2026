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
  AlertCircle
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

  // Screen 1: Auth Logic
  const handleAuth = async () => {
    if (!dmsCode.trim()) return;
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
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
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
      setError("Lỗi gửi dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = empId.trim().length > 0 && images.gpkd && images.cccd;

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 font-sans text-neutral-900">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        capture="environment" 
        onChange={handleFileChange}
      />

      <AnimatePresence mode="wait">
        {/* SCREEN 1: AUTH */}
        {screen === "auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl shadow-blue-500/10"
          >
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                <Store size={40} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">DMS Auth</h1>
              <p className="text-neutral-500 mt-2">Xác thực mã cửa hàng để bắt đầu</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Mã DMS cửa hàng</label>
                <input
                  type="text"
                  value={dmsCode}
                  onChange={(e) => setDmsCode(e.target.value)}
                  placeholder="Nhập mã DMS..."
                  autoFocus
                  className="w-full px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-neutral-400"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={loading || !dmsCode.trim()}
                className="w-full h-16 bg-blue-600 disabled:bg-neutral-200 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Tiếp tục <ArrowRight size={20} /></>}
              </button>
            </div>
          </motion.div>
        )}

        {/* SCREEN 2: DATA COLLECTION */}
        {screen === "collect" && (
          <motion.div
            key="collect"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-md bg-white min-h-[600px] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-neutral-100 flex items-center gap-4 bg-white sticky top-0 z-10">
              <button 
                onClick={() => setScreen("auth")}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-50 text-neutral-400 transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-xl font-bold">Thu thập dữ liệu</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Employee ID */}
              <div>
                <label className="block text-sm font-bold text-neutral-600 mb-3 ml-1">Mã nhân viên (Bắt buộc)</label>
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="Nhập mã nhân viên..."
                  className="w-full px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Photo GPKD */}
              <div>
                <label className="block text-sm font-bold text-neutral-600 mb-3 ml-1 uppercase tracking-wider">Giấy phép kinh doanh</label>
                {!images.gpkd ? (
                  <button
                    onClick={() => triggerCamera("gpkd")}
                    className="w-full h-40 border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-blue-50 hover:border-blue-300 rounded-3xl flex flex-col items-center justify-center gap-3 text-neutral-400 hover:text-blue-500 transition-all group"
                  >
                    <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Camera size={28} />
                    </div>
                    <span className="font-semibold text-sm">GIAY_PHEP_KINH_DOANH</span>
                  </button>
                ) : (
                  <div className="relative rounded-3xl overflow-hidden shadow-lg border border-neutral-100 h-48 group">
                    <img src={images.gpkd} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <button 
                        onClick={() => removeImage("gpkd")}
                        className="bg-red-500 text-white p-3 rounded-full hover:scale-110 transition-transform"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Photo CCCD */}
              <div>
                <label className="block text-sm font-bold text-neutral-600 mb-3 ml-1 uppercase tracking-wider">Căn cước công dân</label>
                {!images.cccd ? (
                  <button
                    onClick={() => triggerCamera("cccd")}
                    className="w-full h-40 border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-blue-50 hover:border-blue-300 rounded-3xl flex flex-col items-center justify-center gap-3 text-neutral-400 hover:text-blue-500 transition-all group"
                  >
                    <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <IdCard size={28} />
                    </div>
                    <span className="font-semibold text-sm">CAN_CUOC_CONG_DAN</span>
                  </button>
                ) : (
                  <div className="relative rounded-3xl overflow-hidden shadow-lg border border-neutral-100 h-48 group">
                    <img src={images.cccd} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <button 
                        onClick={() => removeImage("cccd")}
                        className="bg-red-500 text-white p-3 rounded-full hover:scale-110 transition-transform"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-white border-t border-neutral-100 shadow-[0_-8px_16px_rgba(0,0,0,0.02)]">
              <button
                onClick={handleSubmit}
                disabled={!isFormValid || loading}
                className={`w-full py-5 rounded-2xl font-black text-xl tracking-widest transition-all active:scale-95 flex items-center justify-center ${
                  isFormValid && !loading 
                    ? "bg-green-600 text-white shadow-xl shadow-green-200" 
                    : "bg-neutral-100 text-neutral-400 opacity-0 pointer-events-none"
                }`}
              >
                {loading ? <Loader2 className="animate-spin" /> : "KẾT THÚC"}
              </button>
            </div>
          </motion.div>
        )}

        {/* SCREEN 3: SUCCESS */}
        {screen === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl text-center"
          >
            <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 text-green-500">
              <CheckCircle2 size={56} />
            </div>
            <h2 className="text-3xl font-black mb-4">Hoàn tất!</h2>
            <p className="text-neutral-500 leading-relaxed mb-10">
              Dữ liệu DMS <b>{dmsCode}</b> đã được gửi đi và xử lý OCR thành công.
            </p>
            <button
              onClick={() => {
                setScreen("auth");
                setDmsCode("");
                setEmpId("");
                setImages({ gpkd: null, cccd: null });
              }}
              className="w-full py-5 bg-neutral-900 text-white rounded-3xl font-bold shadow-xl hover:bg-black transition-all"
            >
              Quay lại trang chủ
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL LOADING INDICATOR */}
      {loading && screen !== "auth" && screen !== "success" && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-white">
          <Loader2 className="w-16 h-16 animate-spin text-blue-400 mb-6" />
          <h3 className="text-2xl font-bold">Đang xử lý OCR...</h3>
          <p className="mt-2 text-neutral-300 px-10 text-center">Chúng tôi đang bóc tách thông tin từ ảnh và lưu lên hệ thống</p>
        </div>
      )}
    </div>
  );
}
