"use client";

import { useState, useEffect } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { useParams } from "next/navigation";
import { CheckCircle, BookOpen, Award, FileText, UploadCloud, User, Info } from "lucide-react";

export default function StudentResearchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<any>(null);
  
  // Document upload state
  const [docType, setDocType] = useState("");
  const [fileId, setFileId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  // Complete state
  const [completeOpen, setCompleteOpen] = useState(false);
  const [score, setScore] = useState("");
  const [award, setAward] = useState("");

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/v1/student-research/${id}`);
      if (res.ok) {
        setProject(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  const handleUpload = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/student-research/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: docType, fileId })
      });
      if (res.ok) {
        setUploadOpen(false);
        setDocType("");
        setFileId("");
        fetchProject();
      } else {
        alert("Lỗi khi upload (có thể bạn không có quyền).");
      }
    } catch(e) {
      console.error(e);
    }
  }

  const handleComplete = async (e: any) => {
    e.preventDefault();
    if (!confirm("Xác nhận nghiệm thu đề tài này?")) return;
    try {
      const res = await fetch(`/api/v1/student-research/${id}/complete`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          score: score ? parseFloat(score) : undefined, 
          award: award || undefined 
        })
      });
      if (res.ok) {
        setCompleteOpen(false);
        fetchProject();
      } else {
        alert("Có lỗi xảy ra khi duyệt nghiệm thu.");
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!project) return (
    <div className="flex justify-center items-center h-64 text-gray-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
      Đang tải dữ liệu đề tài...
    </div>
  );

  const isCompleted = project.status === "COMPLETED";

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "NCKH Sinh viên", href: "/student-research" },
        { label: project.code }
      ]} />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          eyebrow={`Đề tài: ${project.code}`}
          title={project.name}
          description={`Chủ nhiệm: ${project.studentName} — Lớp: ${project.studentClass}`}
        />
        {isCompleted ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-50 text-green-700 border border-green-200 shadow-sm">
            <CheckCircle size={16} /> Đã nghiệm thu
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
            <BookOpen size={16} /> Đang thực hiện
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
        {/* Thông tin */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Info className="text-blue-500" size={18} />
              <h3 className="font-semibold text-gray-900">Thông tin chung</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Giảng viên hướng dẫn</p>
                <div className="flex items-center gap-2">
                  <div className="bg-gray-100 p-1.5 rounded-full"><User size={14} className="text-gray-600" /></div>
                  <span className="font-medium text-gray-900">{project.supervisor?.displayName || project.supervisorId}</span>
                </div>
              </div>
              
              {project.score != null && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Điểm số</p>
                  <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-800 font-bold rounded text-lg">
                    {project.score}
                  </span>
                </div>
              )}
              
              {project.award && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Giải thưởng</p>
                  <div className="flex items-center gap-2 text-amber-600 font-medium bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                    <Award size={18} />
                    {project.award}
                  </div>
                </div>
              )}
              
              {!isCompleted && (
                <div className="pt-4 mt-4 border-t border-gray-100">
                  <button 
                    onClick={() => setCompleteOpen(true)} 
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                  >
                    <CheckCircle size={18} />
                    Duyệt Nghiệm thu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tài liệu */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-500" size={18} />
                <h3 className="font-semibold text-gray-900">Hồ sơ & Tài liệu</h3>
              </div>
              <button 
                onClick={() => setUploadOpen(true)} 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
              >
                <UploadCloud size={16} /> Nộp tài liệu
              </button>
            </div>
            
            <div className="p-0">
              {project.documents?.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500 bg-white">
                  <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-base font-medium">Chưa có tài liệu nào</p>
                  <p className="text-sm mt-1">Các báo cáo, minh chứng sẽ hiển thị tại đây.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {project.documents?.map((doc: any) => (
                    <li key={doc.id} className="p-5 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                      <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600 shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 mb-1">{doc.documentType}</p>
                        <p className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded inline-block mb-2">ID: {doc.fileId}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <User size={12} />
                          <span>{doc.uploadedBy?.displayName}</span>
                          <span>•</span>
                          <span>{new Date(doc.uploadedAt).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {completeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nghiệm thu Đề tài</h3>
              <button onClick={() => setCompleteOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Điểm số (Thang 10)</label>
                <input type="number" step="0.1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={score} onChange={(e: any) => setScore(e.target.value)} placeholder="Ví dụ: 8.5" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Giải thưởng (nếu có)</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={award} onChange={(e: any) => setAward(e.target.value)} placeholder="Ví dụ: Giải Nhất, Xuất sắc..." />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button type="button" className="px-4 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" onClick={() => setCompleteOpen(false)}>Hủy</button>
                <button type="submit" className="px-4 py-2 font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">Xác nhận</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nộp tài liệu</h3>
              <button onClick={() => setUploadOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Loại tài liệu</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={docType} onChange={(e: any) => setDocType(e.target.value)} placeholder="Báo cáo giữa kỳ..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã file (File ID)</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={fileId} onChange={(e: any) => setFileId(e.target.value)} placeholder="Nhập ID file" required />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button type="button" className="px-4 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" onClick={() => setUploadOpen(false)}>Hủy</button>
                <button type="submit" className="px-4 py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Lưu lại</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
