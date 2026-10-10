"use client";

import { useState, useEffect } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { useParams } from "next/navigation";

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

  if (!project) return <div>Đang tải...</div>;

  return (
    <>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "NCKH Sinh viên", href: "/student-research" },
        { label: project.code }
      ]} />
      <PageHeader
        eyebrow={`Đề tài: ${project.code}`}
        title={project.name}
        description={`Sinh viên thực hiện: ${project.studentName} - Lớp: ${project.studentClass}`}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
        {/* Thông tin */}
        <div className="p-4 bg-white rounded shadow">
          <h3 className="font-bold text-lg border-b pb-2 mb-4">Thông tin chung</h3>
          <p><strong>Trạng thái: </strong>{project.status}</p>
          <p><strong>Giảng viên hướng dẫn: </strong>{project.supervisor?.displayName || project.supervisorId}</p>
          
          {project.score != null && <p><strong>Điểm số: </strong>{project.score}</p>}
          {project.award && <p><strong>Giải thưởng: </strong>{project.award}</p>}
          
          {project.status !== "COMPLETED" && (
            <>
              <button onClick={() => setCompleteOpen(true)} className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                Duyệt Nghiệm thu
              </button>
              
              {completeOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white p-6 rounded shadow max-w-sm w-full">
                    <h3 className="text-lg font-bold mb-4">Duyệt Nghiệm thu Đề tài</h3>
                    <form onSubmit={handleComplete} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium">Điểm số</label>
                        <input type="number" step="0.1" className="w-full border p-2 rounded" value={score} onChange={(e: any) => setScore(e.target.value)} placeholder="Ví dụ: 8.5" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium">Giải thưởng (nếu có)</label>
                        <input className="w-full border p-2 rounded" value={award} onChange={(e: any) => setAward(e.target.value)} placeholder="Ví dụ: Nhất, Nhì..." />
                      </div>
                      <div className="flex justify-end space-x-2 pt-4">
                        <button type="button" className="px-4 py-2 bg-gray-200 rounded" onClick={() => setCompleteOpen(false)}>Hủy</button>
                        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">Xác nhận</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Tài liệu */}
        <div className="p-4 bg-white rounded shadow">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="font-bold text-lg">Tài liệu đính kèm</h3>
            <button onClick={() => setUploadOpen(true)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Nộp báo cáo</button>
          </div>
          
          {uploadOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded shadow max-w-sm w-full">
                <h3 className="text-lg font-bold mb-4">Nộp tài liệu</h3>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium">Loại tài liệu</label>
                    <input className="w-full border p-2 rounded" value={docType} onChange={(e: any) => setDocType(e.target.value)} placeholder="Báo cáo giữa kỳ..." required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Mã file (File ID)</label>
                    <input className="w-full border p-2 rounded" value={fileId} onChange={(e: any) => setFileId(e.target.value)} placeholder="Nhập ID file" required />
                  </div>
                  <div className="flex justify-end space-x-2 pt-4">
                    <button type="button" className="px-4 py-2 bg-gray-200 rounded" onClick={() => setUploadOpen(false)}>Hủy</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Lưu lại</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {project.documents?.length === 0 && <p className="text-gray-500 italic">Chưa có tài liệu nào.</p>}
          <ul className="space-y-2 mt-4">
            {project.documents?.map((doc: any) => (
              <li key={doc.id} className="p-2 border rounded flex flex-col">
                <span className="font-semibold">{doc.documentType}</span>
                <span className="text-sm text-gray-600">ID: {doc.fileId}</span>
                <span className="text-xs text-gray-400">Upload bởi: {doc.uploadedBy?.displayName} lúc {new Date(doc.uploadedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
