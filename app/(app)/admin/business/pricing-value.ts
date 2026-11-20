/** Đọc số người nhập: bỏ khoảng trắng, chấp nhận dấu , làm dấu thập phân; từ chối kiểu 1.500 hay 1,500 vì không rõ là nghìn hay thập phân. */
export function parsePricingValue(raw: string): { value: string | null } | { error: string } {
  const s = raw.replace(/\s/g, "");
  if (s === "") return { value: null };
  if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(s)) return { error: "Không dùng dấu chấm hoặc phẩy ngăn cách hàng nghìn (ví dụ viết 1500 hoặc 1500.5)." };
  if (!/^\d{1,14}([.,]\d{1,4})?$/.test(s)) return { error: "Giá trị phải là số không âm, tối đa 4 chữ số thập phân (ví dụ 1500 hoặc 0.75)." };
  return { value: s.replace(",", ".") };
}
