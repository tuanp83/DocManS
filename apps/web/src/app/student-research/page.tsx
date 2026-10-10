"use client";

import { useState, useEffect } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { useRouter } from "next/navigation";
import { Search, Plus, BookOpen, User, CheckCircle, GraduationCap, ArrowRight } from "lucide-react";

export default function StudentResearchPage() {
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  
  // Form state
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    studentName: "",
    studentClass: "",
    supervisorId: "",
  });

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/v1/student-research");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/student-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setOpen(false);
        fetchProjects();
        setFormData({ code: "", name: "", studentName: "", studentClass: "", supervisorId: "" });
      } else {
        alert("Có lỗi xảy ra khi tạo đề tài.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "COMPLETED") return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"><CheckCircle size={14} /> Đã nghiệm thu</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"><BookOpen size={14} /> Đang thực hiện</span>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "NCKH Sinh viên", href: "/student-research" }]} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader
          eyebrow="NCKH"
          title="Đề tài NCKH Sinh viên"
          description="Quản lý, giám sát và nghiệm thu đề tài cấp sinh viên."
        />
        <button 
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus size={18} />
          <span>Đề tài mới</span>
        </button>
      </div>
      
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200 font-medium uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Mã ĐT</th>
                <th className="px-6 py-4">Tên đề tài</th>
                <th className="px-6 py-4">Sinh viên / Lớp</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <BookOpen className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-base font-medium">Chưa có đề tài nào</p>
                    <p className="text-sm">Hãy tạo đề tài đầu tiên cho sinh viên.</p>
                  </td>
                </tr>
              ) : (
                projects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {p.code}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 line-clamp-2">{p.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {p.studentName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{p.studentName}</div>
                          <div className="text-xs text-gray-500">{p.studentClass}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(p.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button 
                        className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        onClick={() => router.push(`/student-research/${p.id}`)}
                        title="Xem chi tiết"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Khởi tạo Đề tài Sinh viên</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Mã đề tài</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" value={formData.code} onChange={(e: any) => setFormData({...formData, code: e.target.value})} placeholder="VD: SV2026-01" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Mã Giảng viên (ID)</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" value={formData.supervisorId} onChange={(e: any) => setFormData({...formData, supervisorId: e.target.value})} placeholder="User ID GVHD" required />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Tên đề tài</label>
                <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-none" rows={2} value={formData.name} onChange={(e: any) => setFormData({...formData, name: e.target.value})} placeholder="Nhập tên đề tài..." required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Họ tên sinh viên</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" value={formData.studentName} onChange={(e: any) => setFormData({...formData, studentName: e.target.value})} placeholder="Nguyễn Văn A" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Lớp hành chính</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" value={formData.studentClass} onChange={(e: any) => setFormData({...formData, studentClass: e.target.value})} placeholder="AT18A" required />
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" onClick={() => setOpen(false)}>Hủy bỏ</button>
                <button type="submit" className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors">Xác nhận tạo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

