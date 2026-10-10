"use client";

import { useState, useEffect } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { useRouter } from "next/navigation";

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
      } else {
        alert("Có lỗi xảy ra khi tạo đề tài.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "NCKH Sinh viên", href: "/student-research" }]} />
      <PageHeader
        eyebrow="NCKH"
        title="Danh sách đề tài NCKH Sinh viên"
        description="Quản lý và giám sát các đề tài nghiên cứu khoa học của sinh viên."
      />
      
      <div className="p-4 bg-white rounded shadow my-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Tất cả đề tài</h2>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={() => setOpen(true)}>+ Tạo đề tài mới</button>
        </div>

        {open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded shadow max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">Tạo Đề tài Mới</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium">Mã đề tài</label>
                  <input className="w-full border p-2 rounded" value={formData.code} onChange={(e: any) => setFormData({...formData, code: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium">Tên đề tài</label>
                  <input className="w-full border p-2 rounded" value={formData.name} onChange={(e: any) => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium">Tên sinh viên</label>
                  <input className="w-full border p-2 rounded" value={formData.studentName} onChange={(e: any) => setFormData({...formData, studentName: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium">Lớp</label>
                  <input className="w-full border p-2 rounded" value={formData.studentClass} onChange={(e: any) => setFormData({...formData, studentClass: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium">Mã Giảng viên hướng dẫn (ID)</label>
                  <input className="w-full border p-2 rounded" value={formData.supervisorId} onChange={(e: any) => setFormData({...formData, supervisorId: e.target.value})} required />
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <button type="button" className="px-4 py-2 bg-gray-200 rounded" onClick={() => setOpen(false)}>Hủy</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Lưu lại</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Mã ĐT</th>
              <th className="text-left p-2">Tên đề tài</th>
              <th className="text-left p-2">Sinh viên</th>
              <th className="text-left p-2">Trạng thái</th>
              <th className="text-left p-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p: any) => (
              <tr key={p.id} className="border-b">
                <td className="p-2">{p.code}</td>
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.studentName}</td>
                <td className="p-2">{p.status}</td>
                <td className="p-2">
                  <button className="text-blue-600 hover:underline" onClick={() => router.push(`/student-research/${p.id}`)}>
                    Xem chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
