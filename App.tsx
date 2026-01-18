
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { Step, ImageFile, VerificationReport, ClientValidationResult, DashboardRecord } from './types';
import { verifyImages, validateClientImage } from './services/geminiService';

const { jsPDF } = (window as any).jspdf;

const CameraModal: React.FC<{
  onCapture: (base64: string) => void;
  onClose: () => void;
}> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError("No se pudo acceder a la cámara.");
      }
    };
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/jpeg', 0.8));
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
      <div className="absolute top-6 right-6 z-10">
        <button onClick={onClose} className="bg-white/20 p-3 rounded-full text-black">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      {error ? <div className="text-white">{error}</div> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
      <div className="absolute bottom-12">
        <button onClick={takePhoto} className="w-20 h-20 bg-white rounded-full border-8 border-white/30 flex items-center justify-center">
          <div className="w-14 h-14 bg-white rounded-full border-2 border-slate-200" />
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const ReportSection: React.FC<{
  title: string;
  status: 'OK' | 'WARNING';
  details: string;
  children?: React.ReactNode;
  isDamage?: boolean;
}> = ({ title, status, details, children, isDamage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isWarning = status === 'WARNING';
  const bgColor = isWarning ? (isDamage ? 'bg-rose-50 border-rose-500' : 'bg-amber-50 border-amber-500') : 'bg-emerald-50 border-emerald-500';
  const textColor = isWarning ? (isDamage ? 'text-rose-800' : 'text-amber-800') : 'text-emerald-800';
  
  return (
    <div className={`p-6 rounded-2xl border-l-8 shadow-sm mb-4 transition-all ${bgColor}`}>
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center space-x-3">
          <h4 className={`text-lg font-bold ${textColor}`}>{title}</h4>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isWarning ? 'bg-rose-200' : 'bg-emerald-200'}`}>{status}</span>
        </div>
        <svg className={`w-6 h-6 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
      </div>
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-black/5">
          {children}
          <p className="text-sm text-slate-600 mt-2 italic">{details}</p>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('client-photo');
  const [viewMode, setViewMode] = useState<'verification' | 'dashboard'>('verification');
  const [clientImage, setClientImage] = useState<ImageFile | null>(null);
  const [returnImages, setReturnImages] = useState<ImageFile[]>([]);
  const [isValidatingClient, setIsValidatingClient] = useState(false);
  const [clientValidation, setClientValidation] = useState<ClientValidationResult | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'client' | 'return'>('client');
  const [verificationStatus, setVerificationStatus] = useState<string>("Iniciando proceso...");
  
  const UPLOAD_API_URL = 'https://script.google.com/macros/s/AKfycbx9VPUrxKbco6s3MMQ9NPNWcvXPhG7jbgLkZ0zKcbvahauLflqkHbvt0lYgXwbh_Nm0/exec';
  const DASHBOARD_API_URL = 'https://script.google.com/macros/s/AKfycbxdej0UDYg_TA0mvvrc35v4ojIKFbcp90zdvfNXwqpa-hyiz0ZzO-F-PXcH5eSWGvCAyA/exec';

  const [dashboardData, setDashboardData] = useState<DashboardRecord[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [filterShipping, setFilterShipping] = useState("");
  const [filterStatus, setFilterStatus] = useState<"All" | "Warning" | "OK">("All");

  const clientInputRef = useRef<HTMLInputElement>(null);
  const returnInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (viewMode === 'dashboard') {
      fetchDashboardData();
    }
  }, [viewMode]);

  const fetchDashboardData = async () => {
    setIsLoadingDashboard(true);
    setDashboardError(null);
    try {
      const response = await fetch(DASHBOARD_API_URL, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) throw new Error(`Servidor respondió con status: ${response.status}`);
      const data = await response.json();
      if (data && data.error) throw new Error(data.error);
      setDashboardData(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error("Error Dashboard:", e);
      setDashboardError("No se pudo conectar con la base de datos.");
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const pad = (n: number) => n.toString().padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  };

  const filteredData = useMemo(() => {
    return dashboardData.filter(record => {
      const matchShipping = (record.shippingNumber || "").toLowerCase().includes(filterShipping.toLowerCase());
      const recordStatus = (record.status || "").toLowerCase();
      const matchStatus = filterStatus === "All" || recordStatus === filterStatus.toLowerCase();
      return matchShipping && matchStatus;
    });
  }, [dashboardData, filterShipping, filterStatus]);

  const resetApp = () => {
    setCurrentStep('client-photo');
    setClientImage(null);
    setReturnImages([]);
    setIsValidatingClient(false);
    setClientValidation(null);
    setReport(null);
    setVerificationStatus("Iniciando proceso...");
  };

  const generatePDF = async (reportData: VerificationReport, validationData: ClientValidationResult | null, clientImg: ImageFile, returnImgs: ImageFile[]) => {
    const doc = new jsPDF();
    const detected = validationData?.detectedData || {};
    const now = new Date();
    const dateStr = now.toLocaleString();
    
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("INFORME DE VERIFICACIÓN AI", 15, 25);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${dateStr}`, 15, 33);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DETECTADOS POR IA", 15, 60);

    const fields = [
      ["Nº Envío/Pedido:", detected.shippingNumber || "No detectado"],
      ["EAN:", detected.ean || "No detectado"],
      ["QL:", detected.ql || "No detectado"],
      ["Marca:", detected.brand || "No detectado"],
      ["Color:", detected.color || "No detectado"],
      ["Talla:", detected.size || "No detectado"],
      ["Talla Prov.:", detected.vendorSize || "No detectado"],
      ["Descripción:", detected.description || "No detectado"]
    ];

    let startY = 70;
    let colWidth = 90;
    let rowHeight = 12;
    
    fields.forEach(([label, value], index) => {
      const isSecondCol = index % 2 !== 0;
      const x = isSecondCol ? 110 : 15;
      const y = startY + (Math.floor(index / 2) * (rowHeight + 4));
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, colWidth, rowHeight, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text(String(label).toUpperCase(), x + 4, y + 4.5);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      const cleanValue = String(value).length > 40 ? String(value).substring(0, 37) + "..." : String(value);
      doc.text(cleanValue, x + 4, y + 9.5);
    });

    let currentY = startY + (Math.ceil(fields.length / 2) * (rowHeight + 4)) + 10;
    const splitSummary = doc.splitTextToSize(reportData.summary, 175);
    const boxHeight = (splitSummary.length * 5) + 14;
    doc.setFillColor(241, 245, 249);
    doc.rect(12, currentY, 186, boxHeight, 'F');
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0,0,0);
    doc.text("RESUMEN PERITAJE:", 15, currentY + 8);
    doc.setFont("helvetica", "italic");
    doc.text(splitSummary, 15, currentY + 14);

    currentY += boxHeight + 15;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ANÁLISIS DETALLADO:", 15, currentY);
    currentY += 10;

    const analysisItems = [
      { num: "1", title: "Código EAN / Referencia", status: reportData.eanMatch, details: reportData.eanDetails },
      { num: "2", title: "Apariencia y Autenticidad", status: reportData.visualMatch, details: reportData.visualDetails },
      { num: "3", title: "Estado e Integridad", status: reportData.damageDetected, details: reportData.damageDetails }
    ];

    analysisItems.forEach(item => {
      if (currentY > 260) { doc.addPage(); currentY = 20; }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`${item.num}. ${item.title}: `, 15, currentY);
      const statusLabel = `[${item.status}]`;
      if (item.status === 'OK') doc.setTextColor(16, 185, 129);
      else doc.setTextColor(225, 29, 72);
      doc.text(statusLabel, 75, currentY);
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      currentY += 6;
      const splitDetails = doc.splitTextToSize(item.details, 180);
      doc.text(splitDetails, 15, currentY);
      currentY += (splitDetails.length * 5) + 8;
    });

    doc.addPage();
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FOTOS REFERENCIA CLIENTE", 15, 17);
    try { doc.addImage(clientImg.base64, 'JPEG', 15, 35, 180, 130, undefined, 'FAST'); } catch (e) {}

    doc.addPage();
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("FOTOS PRODUCTO DEVUELTO", 15, 17);
    let imgY = 35;
    let col = 0;
    returnImgs.forEach((img, idx) => {
      if (idx > 0 && idx % 4 === 0) {
        doc.addPage();
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, 210, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text("FOTOS PRODUCTO DEVUELTO (CONT.)", 15, 17);
        imgY = 35;
      }
      const x = col === 0 ? 15 : 110;
      try { doc.addImage(img.base64, 'JPEG', x, imgY, 85, 65, undefined, 'FAST'); } catch (e) {}
      if (col === 1) { col = 0; imgY += 75; } else { col = 1; }
    });

    const hasAnyWarning = reportData.eanMatch === 'WARNING' || reportData.visualMatch === 'WARNING' || reportData.damageDetected === 'WARNING';
    const suffix = hasAnyWarning ? "S" : "N";
    const ts = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const shippingNum = detected.shippingNumber || reportData.shippingNumber || "No_detectado";
    return { 
      base64: doc.output('datauristring').split(',')[1], 
      fileName: `${shippingNum}_${ts}_${suffix}.pdf`, 
      metadata: {
        shippingNumber: shippingNum,
        ean: detected.ean || "No detectado",
        ql: detected.ql || "No detectado",
        description: detected.description || "No detectado",
        status: suffix === "S" ? "Warning" : "OK"
      }
    };
  };

  const uploadToGoogle = async (pdfObj: any) => {
    try {
      await fetch(UPLOAD_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          base64: pdfObj.base64, 
          fileName: pdfObj.fileName,
          ...pdfObj.metadata
        })
      });
    } catch (e) { console.error("Error subiendo datos:", e); }
  };

  const handleStartVerification = async () => {
    setCurrentStep('verification');
    setVerificationStatus("Analizando prendas con IA...");
    try {
      const res = await verifyImages(clientImage!.base64, returnImages.map(i => i.base64));
      setReport(res);
      setVerificationStatus("Generando informe PDF detallado...");
      const pdf = await generatePDF(res, clientValidation, clientImage!, returnImages);
      setVerificationStatus("Sincronizando con Google Drive y Sheets...");
      await uploadToGoogle(pdf);
      setVerificationStatus("Finalizando peritaje...");
      setTimeout(() => setCurrentStep('report'), 500);
    } catch (error) {
      setVerificationStatus("Error durante el análisis. Inténtalo de nuevo.");
      setTimeout(() => setCurrentStep('return-photos'), 3000);
    }
  };

  const processFile = async (base64: string, type: 'client' | 'return') => {
    if (type === 'client') {
      setClientImage({ id: 'c', url: base64, base64, type });
      setIsValidatingClient(true);
      try {
        const val = await validateClientImage(base64);
        setClientValidation(val);
      } catch (e) {} finally { setIsValidatingClient(false); }
    } else {
      setReturnImages(prev => [...prev, { id: Math.random().toString(), url: base64, base64, type }]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'client' | 'return') => {
    const files = e.target.files;
    if (!files) return;
    (Array.from(files) as File[]).forEach(file => {
      const r = new FileReader();
      r.onload = () => processFile(r.result as string, type);
      r.readAsDataURL(file);
    });
    e.target.value = '';
  };

  return (
    <>
      {isCameraOpen && <CameraModal onCapture={(b) => processFile(b, cameraTarget)} onClose={() => setIsCameraOpen(false)} />}

      {currentStep === 'client-photo' && (
        <Layout 
          title={viewMode === 'verification' ? "Módulo de Verificación" : "Audit Center Dashboard"} 
          step={1} 
          fullWidth={viewMode === 'dashboard'}
        >
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 w-fit mx-auto border border-slate-200 shadow-sm">
            <button onClick={() => setViewMode('verification')} className={`px-10 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${viewMode === 'verification' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Verificación</button>
            <button onClick={() => setViewMode('dashboard')} className={`px-10 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${viewMode === 'dashboard' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Dashboard</button>
          </div>

          {viewMode === 'verification' ? (
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200">
              <p className="text-slate-500 mb-8 italic text-sm text-center">Capture la etiqueta original de envío para iniciar la trazabilidad.</p>
              <div className="border-3 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 min-h-[250px] flex flex-col items-center justify-center transition-all hover:border-indigo-300">
                {clientImage ? (
                  <div className="flex flex-col items-center w-full">
                    <div className="relative group">
                      <img src={clientImage.url} className="max-h-72 rounded-xl shadow-lg mb-4 ring-4 ring-white" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <button onClick={() => { setClientImage(null); setClientValidation(null); }} className="bg-white text-rose-600 p-3 rounded-full font-bold shadow-xl">Eliminar</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 w-full max-w-sm">
                    <div className="text-center font-black text-slate-900 uppercase tracking-tighter text-xl">Captura de Etiqueta</div>
                    <div className="flex flex-col gap-3">
                      <button onClick={() => { setCameraTarget('client'); setIsCameraOpen(true); }} className="w-full bg-indigo-600 text-black py-4 rounded-xl font-black shadow-lg hover:bg-indigo-700 transform transition active:scale-95 flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        USAR CÁMARA
                      </button>
                      <button onClick={() => clientInputRef.current?.click()} className="w-full bg-white border-2 border-slate-200 py-3 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-colors">SUBIR ARCHIVO</button>
                    </div>
                    <input ref={clientInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'client')} />
                  </div>
                )}
              </div>

              {isValidatingClient && (
                <div className="mt-6 p-5 bg-indigo-50 border-2 border-indigo-100 text-indigo-700 rounded-2xl animate-pulse font-black text-center flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-3 border-indigo-700 border-t-transparent rounded-full animate-spin"></div>
                  EXTRAYENDO METADATOS...
                </div>
              )}

              {clientValidation && (
                <div className={`mt-8 p-6 rounded-2xl border-2 ${clientValidation.isValid ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100' : 'bg-rose-50 border-rose-200 shadow-rose-100'} shadow-lg transition-all`}>
                  <div className="flex items-center gap-3 mb-5 border-b border-black/5 pb-4">
                    <span className={`w-4 h-4 rounded-full ${clientValidation.isValid ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                    <h4 className={`font-black uppercase text-sm tracking-widest ${clientValidation.isValid ? 'text-emerald-900' : 'text-rose-900'}`}>
                      {clientValidation.isValid ? 'SISTEMA LISTO: REFERENCIA VALIDADA' : 'ERROR: REFERENCIA NO DETECTADA'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Nº Envío</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.shippingNumber}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">EAN Code</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.ean}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">QL</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.ql}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Marca</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.brand}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Color</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.color}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Talla</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.size}</p>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Talla Prov.</p>
                      <p className="font-bold text-slate-900 text-sm truncate">{clientValidation.detectedData.vendorSize}</p>
                    </div>
                    <div className="md:col-span-2 bg-white/80 p-3 rounded-xl border border-black/5 shadow-sm">
                      <p className="text-slate-400 font-black uppercase text-[9px] mb-1">Descripción</p>
                      <p className="font-bold text-slate-900 text-sm line-clamp-1">{clientValidation.detectedData.description}</p>
                    </div>
                  </div>
                </div>
              )}

              <button disabled={!clientValidation?.isValid || isValidatingClient} onClick={() => setCurrentStep('return-photos')} className="w-full mt-10 bg-indigo-600 py-5 rounded-2xl font-black text-black shadow-2xl disabled:bg-slate-200 disabled:text-slate-400 transition-all hover:bg-indigo-700 hover:-translate-y-1 active:scale-95 text-lg tracking-tighter">
                {clientValidation?.isValid ? "PROCEDER AL PERITAJE" : "BLOQUEADO: CAPTURE ETIQUETA"}
              </button>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Dashboard Control Bar */}
              <div className="bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 flex flex-col md:flex-row gap-6 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-black text-slate-900 uppercase mb-3 tracking-widest ml-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    Búsqueda por Nº Envío
                  </label>
                  <input type="text" placeholder="Escriba el número de seguimiento..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-300" value={filterShipping} onChange={(e) => setFilterShipping(e.target.value)} />
                </div>
                <div className="w-full md:w-64">
                  <label className="block text-xs font-black text-slate-900 uppercase mb-3 tracking-widest ml-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                    Filtrar Status
                  </label>
                  <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer appearance-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                    <option value="All">Ver Todos</option>
                    <option value="Warning">Incidencias (Warning)</option>
                    <option value="OK">Correctos (OK)</option>
                  </select>
                </div>
                <button onClick={fetchDashboardData} className="w-full md:w-auto p-4 bg-indigo-600 text-black rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 group" title="Refrescar base de datos">
                   <svg className={`w-6 h-6 ${isLoadingDashboard ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </button>
              </div>

              {dashboardError && (
                <div className="p-5 bg-rose-600 text-white rounded-2xl shadow-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 14c-.77 1.333.192 3 1.732 3z"/></svg>
                    <p className="font-bold">{dashboardError}</p>
                  </div>
                  <button onClick={fetchDashboardData} className="bg-white/20 px-4 py-2 rounded-lg font-black hover:bg-white/30 transition-colors">REINTENTAR</button>
                </div>
              )}

              {/* Data Table */}
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
                {isLoadingDashboard ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-20">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                    <p className="text-slate-900 font-black uppercase tracking-widest text-sm">Sincronizando registros...</p>
                  </div>
                ) : filteredData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead>
                        <tr className="bg-slate-900 text-white border-b-2 border-slate-800">
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] w-52">Registro Temporal</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Expediente</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">EAN</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">QL</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Detalle Producto</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-center">Calificación</th>
                          <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-center">Informe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredData.map((record, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-all duration-200 group">
                            <td className="px-6 py-6 text-sm font-bold text-slate-500 font-mono">{formatDate(record.date)}</td>
                            <td className="px-6 py-6">
                              <span className="text-sm font-black text-slate-900 block">{record.shippingNumber}</span>
                              <span className="text-[9px] text-indigo-500 font-bold uppercase">ID Verificado</span>
                            </td>
                            <td className="px-6 py-6 text-sm font-black text-slate-700 font-mono">{record.ean}</td>
                            <td className="px-6 py-6 text-sm font-bold text-slate-400">{record.ql}</td>
                            <td className="px-6 py-6 text-sm text-slate-600 max-w-[250px] truncate italic">{record.description}</td>
                            <td className="px-6 py-6 whitespace-nowrap text-center">
                              <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase inline-block min-w-[90px] shadow-sm border ${record.status?.toString().toUpperCase() === 'OK' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-rose-500 text-white border-rose-600'}`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-6 py-6 whitespace-nowrap text-center">
                              <a href={record.link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center p-3 bg-slate-900 text-white rounded-2xl hover:bg-indigo-600 hover:scale-110 transition-all shadow-xl active:scale-95 group-hover:bg-slate-800">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-20 text-center space-y-4">
                    <div className="p-10 bg-slate-50 rounded-full">
                      <svg className="w-20 h-20 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <p className="text-slate-900 text-xl font-black uppercase tracking-tighter">Sin registros disponibles</p>
                    <p className="text-slate-400 text-sm max-w-xs">No se han encontrado peritajes con los criterios de búsqueda actuales.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Layout>
      )}

      {currentStep === 'return-photos' && (
        <Layout title="Peritaje: Producto Devuelto" step={2}>
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200">
            <p className="text-slate-500 mb-8 italic text-sm text-center">Capture imágenes detalladas del producto recibido para detectar discrepancias.</p>
            <div className="border-3 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50 min-h-[250px] flex flex-col items-center justify-center mb-8 hover:border-indigo-300 transition-all">
              <div className="space-y-6 w-full max-w-sm">
                <div className="text-center font-black text-slate-900 uppercase tracking-tight text-lg">Evidencia de Devolución</div>
                <div className="flex flex-col gap-3">
                  <button onClick={() => { setCameraTarget('return'); setIsCameraOpen(true); }} className="w-full bg-indigo-600 text-black py-4 rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    AÑADIR CAPTURA
                  </button>
                  <button onClick={() => returnInputRef.current?.click()} className="w-full bg-white border-2 border-slate-200 py-3 rounded-xl font-bold text-slate-700">SUBIR GALERÍA</button>
                </div>
                <input ref={returnInputRef} type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, 'return')} />
                <p className="text-center text-[10px] text-slate-400 font-black uppercase tracking-widest">Multi-selección activada</p>
              </div>
            </div>
            {returnImages.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {returnImages.map(img => (
                  <div key={img.id} className="relative aspect-square group">
                    <img src={img.url} className="w-full h-full object-cover rounded-2xl shadow-md border-2 border-white ring-1 ring-slate-200" />
                    <button onClick={() => setReturnImages(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-3 -right-3 bg-rose-600 text-white p-2 rounded-full shadow-xl hover:bg-rose-700 hover:scale-110 transition-all active:scale-90 border-2 border-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button disabled={returnImages.length === 0} onClick={handleStartVerification} className="w-full bg-indigo-600 py-5 rounded-2xl font-black text-black shadow-2xl disabled:opacity-50 hover:bg-indigo-700 active:scale-95 text-lg">PROCESAR CON IA</button>
          </div>
        </Layout>
      )}

      {currentStep === 'verification' && (
        <Layout title="Motor de Análisis IA" step={3}>
          <div className="bg-white rounded-3xl p-16 text-center shadow-2xl border border-slate-200 flex flex-col items-center">
            <div className="relative mb-10">
              <div className="w-32 h-32 border-8 border-indigo-50 rounded-full"></div>
              <div className="absolute top-0 w-32 h-32 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-indigo-200 shadow-2xl animate-pulse">V</div>
              </div>
            </div>
            <h3 className="font-black text-slate-900 text-3xl mb-4 tracking-tighter uppercase">Análisis Multimodal</h3>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest max-w-xs mx-auto mb-10">{verificationStatus}</p>
            <div className="w-full bg-slate-100 rounded-full h-3 max-w-sm border border-slate-200 overflow-hidden shadow-inner">
              <div className="bg-indigo-600 h-full rounded-full animate-progress-indefinite"></div>
            </div>
          </div>
          <style>{`@keyframes progress-indefinite { 0% { width: 0%; transform: translateX(-100%); } 50% { width: 40%; transform: translateX(100%); } 100% { width: 0%; transform: translateX(250%); } } .animate-progress-indefinite { animation: progress-indefinite 1.5s infinite ease-in-out; }`}</style>
        </Layout>
      )}

      {currentStep === 'report' && report && (
        <Layout title="Informe Final Pericial" step={4}>
          <div className="space-y-6 pb-20">
            <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-2xl flex justify-between items-center relative overflow-hidden border border-slate-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10"><p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Expediente Nº</p><p className="text-3xl font-black tracking-tighter">{report.shippingNumber}</p></div>
              <div className="relative z-10 bg-indigo-600 p-4 rounded-2xl shadow-indigo-500/20 shadow-2xl"><svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
            </div>
            <ReportSection title="Verificación de Identidad (EAN)" status={report.eanMatch} details={report.eanDetails} />
            <ReportSection title="Integridad Visual y Marca" status={report.visualMatch} details={report.visualDetails} />
            <ReportSection title="Auditoría de Daños" status={report.damageDetected} details={report.damageDetails} isDamage />
            <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-slate-900/5">
              <h4 className="text-slate-900 font-black mb-4 uppercase text-xs tracking-widest flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                Dictamen Final del Perito IA
              </h4>
              <p className="text-slate-600 text-base italic leading-relaxed bg-slate-50 p-6 rounded-2xl border-l-4 border-indigo-600">{report.summary}</p>
              <button onClick={resetApp} className="w-full mt-10 bg-slate-900 py-5 rounded-2xl font-black text-white shadow-2xl hover:bg-black transition-all transform active:scale-95 text-lg">CERRAR Y NUEVO PERITAJE</button>
            </div>
          </div>
        </Layout>
      )}
    </>
  );
};

export default App;
