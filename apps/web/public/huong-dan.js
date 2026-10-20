// Trang hướng dẫn sử dụng (huong-dan-*.html): lọc mục lục và nút in.
// Tách khỏi trang để chạy được dưới chính sách bảo mật nội dung không cho script nội tuyến (src/lib/csp.ts).
function filterNav() {
  const input = document.getElementById("navSearch");
  const filter = input.value.toLowerCase();
  const ul = document.getElementById("navList");
  const li = ul.getElementsByTagName("li");

  for (let i = 0; i < li.length; i++) {
    const a = li[i].getElementsByTagName("a")[0];
    const txtValue = a.textContent || a.innerText;
    li[i].style.display = txtValue.toLowerCase().indexOf(filter) > -1 ? "" : "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("navSearch")?.addEventListener("keyup", filterNav);
  document.querySelector("[data-action='print']")?.addEventListener("click", () => window.print());
});
