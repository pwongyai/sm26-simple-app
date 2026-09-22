"use client";

import { useEffect, useState } from "react";

// Three languages on one screen.
//
// Hương Ngải has Vietnamese farmers and a Vietnamese contractor, Ruang Kaeo
// Thai ones, and Dr. Danh reads English. Language is a property of the person,
// not the community and not the business (app_users.language).
//
// Keyed by the English sentence rather than by an invented key like
// "login.submit". Three reasons, all of them about this project specifically:
// nobody has to keep a key list in their head; a string with no translation
// yet renders in English instead of showing "login.submit" to a farmer; and
// the diff that adds translation to a screen changes `Save` to `{t("Save")}`,
// which stays readable to someone who is not a programmer.
//
// The cost is that changing the English text orphans its translations. That is
// the right trade while the English is still being cut down — and when a
// string is orphaned it falls back to English, which is safe.

const EN = "en";

const DICT = {
  th: {
    "No fields registered to you yet.": "ยังไม่มีแปลงในระบบของคุณ",
    "No contractor is set up for your community yet.": "ชุมชนของคุณยังไม่มีผู้รับจ้าง",
    "Loading services…": "กำลังโหลดบริการ…",
    "No forecast for this field — pick any date below.": "ไม่มีพยากรณ์อากาศสำหรับแปลงนี้ — เลือกวันได้เลย",
    "Area": "พื้นที่",
    "Service": "บริการ",
    "Preferred Date": "วันที่ต้องการ",
    "Next": "ถัดไป",
    "Send this request?": "ส่งคำขอนี้?",
    "Send": "ส่ง",
    "Choose Field": "เลือกแปลง",
    "Choose Contractor": "เลือกผู้รับจ้าง",
    "Choose Service": "เลือกบริการ",
    "Review Request": "ตรวจสอบคำขอ",
    "Your community": "ชุมชนของคุณ",
    "Sending…": "กำลังส่ง…",
    "Send Request": "ส่งคำขอ",
    "This crop is no longer active — it may have been archived or renewed.": "พืชนี้ไม่ได้ใช้งานแล้ว — อาจถูกเก็บหรือเริ่มฤดูใหม่",
    "Back to My Fields": "กลับไปที่แปลงของฉัน",
    "Normal": "ภาพปกติ",
    "NDVI": "NDVI",
    "Decoding satellite capture…": "กำลังประมวลผลภาพดาวเทียม…",
    "Mean NDVI": "ค่า NDVI เฉลี่ย",
    "Satellite captured": "ภาพถ่ายเมื่อ",
    "Loading weather…": "กำลังโหลดสภาพอากาศ…",
    "Seasonal outlook": "แนวโน้มตามฤดูกาล",
    "No weather available for this field.": "ไม่มีข้อมูลอากาศสำหรับแปลงนี้",
    "No work recorded on this field yet.": "ยังไม่มีการบันทึกงานในแปลงนี้",
    "Check for a newer image": "ตรวจหาภาพใหม่",
    "Map": "แผนที่",
    "Weather": "สภาพอากาศ",
    "Activities": "กิจกรรม",
    "Could not load this field from AgroAPI.": "โหลดข้อมูลแปลงไม่สำเร็จ",
    "Could not load NDVI.": "โหลด NDVI ไม่สำเร็จ",
    "Crop not recorded": "ยังไม่ได้บันทึกพืช",
    "No prediction yet": "ยังไม่มีการคาดการณ์",
    "Loading satellite…": "กำลังโหลดภาพดาวเทียม…",
    "Field name": "ชื่อแปลง",
    "Field boundary": "ขอบเขตแปลง",
    "Planting date": "วันที่ปลูก",
    "New season": "ฤดูกาลใหม่",
    "The old season is kept in the field's history.": "ฤดูกาลเดิมยังเก็บอยู่ในประวัติแปลง",
    "Start a new season": "เริ่มฤดูกาลใหม่",
    "Nothing planted yet, so there's no season to renew.": "ยังไม่ได้ปลูก จึงไม่มีฤดูกาลให้เริ่มใหม่",
    "Drag a point to move it, or tap the map to add one.": "ลากจุดเพื่อย้าย หรือแตะแผนที่เพื่อเพิ่มจุด",
    "Loading crops…": "กำลังโหลดชนิดพืช…",
    "No specific variety — no maturity prediction": "ไม่ระบุพันธุ์ — ไม่มีการคาดการณ์วันเก็บเกี่ยว",
    "Done": "เสร็จสิ้น",
    "Start a new season?": "เริ่มฤดูกาลใหม่?",
    "Manage Field": "จัดการแปลง",
    "Field Name": "ชื่อแปลง",
    "Edit Boundary": "แก้ไขขอบเขต",
    "Change Crop": "เปลี่ยนชนิดพืช",
    "Select Variety": "เลือกพันธุ์",
    "Planting Date": "วันที่ปลูก",
    "Could not start a new season.": "เริ่มฤดูกาลใหม่ไม่สำเร็จ",
    "Save name": "บันทึกชื่อ",
    "Save boundary": "บันทึกขอบเขต",
    "Save planting date": "บันทึกวันที่ปลูก",
    "Working…": "กำลังดำเนินการ…",
    "Renew": "เริ่มใหม่",
    "Clear": "ล้าง",
    "Field size": "ขนาดแปลง",
    "Boundary points": "จุดขอบเขต",
    "When did you plant?": "ปลูกเมื่อไหร่?",
    "Size": "ขนาด",
    "Crop": "พืช",
    "Draw Field Boundary": "วาดขอบเขตแปลง",
    "Name Your Field": "ตั้งชื่อแปลง",
    "What are you growing?": "ปลูกอะไร?",
    "Could not create the field.": "สร้างแปลงไม่สำเร็จ",
    "Move the map to find your field, then tap around its edge.": "เลื่อนแผนที่ไปที่แปลงของคุณ แล้วแตะรอบขอบแปลง",
    "Keep tapping to add points. Drag a point to adjust it.": "แตะต่อเพื่อเพิ่มจุด ลากจุดเพื่อปรับ",
    "Not recorded": "ยังไม่ได้บันทึก",
    "Tap the map to start drawing": "แตะแผนที่เพื่อเริ่มวาด",
    "Confirm Boundary": "ยืนยันขอบเขต",
    "Creating…": "กำลังสร้าง…",
    "Save Field": "บันทึกแปลง",
    "Smart Machine": "สมาร์ทแมชชีน",
    "Phone number": "เบอร์โทรศัพท์",
    "Password": "รหัสผ่าน",
    "Sign In": "เข้าสู่ระบบ",
    "Signing in…": "กำลังเข้าสู่ระบบ…",
    "My Fields": "แปลงของฉัน",
    "Requests": "คำขอ",
    "Profile": "โปรไฟล์",
    "Booking": "งานจอง",
    "Machine": "เครื่องจักร",
    "Report": "รายงาน",
    "Settings": "ตั้งค่า",
    "Request Contractor": "เรียกผู้รับจ้าง",
    "Loading…": "กำลังโหลด…",
    "No plots registered to you yet.": "ยังไม่มีแปลงในระบบของคุณ",
    "View Field": "ดูแปลง",
    "Harvested": "เก็บเกี่ยวแล้ว",
    "Season ended": "จบฤดูกาลแล้ว",
    "Not planted yet": "ยังไม่ได้ปลูก",
    "Could not load your fields.": "โหลดข้อมูลแปลงไม่สำเร็จ",
    "Work Orders": "ใบสั่งงาน",
    "Work Report": "รายงานการทำงาน",
    "No requests yet — go to Farm and request a machine order.": "ยังไม่มีคำขอ — ไปที่แปลงเพื่อเรียกรถ",
    "Your name": "ชื่อของคุณ",
    "Edit": "แก้ไข",
    "This is how you sign in — changing it changes your login.": "ใช้เบอร์นี้เข้าสู่ระบบ — ถ้าเปลี่ยน ต้องใช้เบอร์ใหม่",
    "Cancel": "ยกเลิก",
    "Change Password": "เปลี่ยนรหัสผ่าน",
    "At least 6 characters.": "อย่างน้อย 6 ตัวอักษร",
    "Language": "ภาษา",
    "Organization": "องค์กร",
    "Community": "ชุมชน",
    "Contractor": "ผู้รับจ้าง",
    "Currency": "สกุลเงิน",
    "Area unit": "หน่วยพื้นที่",
    "Joined": "เข้าร่วมเมื่อ",
    "Log Out": "ออกจากระบบ",
    "Current password": "รหัสผ่านปัจจุบัน",
    "New password": "รหัสผ่านใหม่",
    "Could not load your profile.": "โหลดโปรไฟล์ไม่สำเร็จ",
    "Could not save.": "บันทึกไม่สำเร็จ",
    "Saved": "บันทึกแล้ว",
    "Could not change password.": "เปลี่ยนรหัสผ่านไม่สำเร็จ",
    "Password changed": "เปลี่ยนรหัสผ่านแล้ว",
    "Saving…": "กำลังบันทึก…",
    "Save": "บันทึก",
    "Work Order": "ใบสั่งงาน",
    "Review Work Report": "ดูรายงานการทำงาน",
    "Overview": "ภาพรวม",
    "Total charge": "ค่าบริการรวม",
    "Close": "ปิด",
    "Status": "สถานะ",
    "Field": "แปลง",
    "Work type": "ประเภทงาน",
    "Crop size": "ขนาดแปลง",
    "Scheduled": "วันนัดหมาย",
    "Requested": "วันที่ขอ",
    "Note": "หมายเหตุ",
    "Cancel request": "ยกเลิกคำขอ",
    "Back": "ย้อนกลับ",
    "Farmer Name": "ชื่อเกษตรกร",
    "Unassigned": "ยังไม่ระบุเจ้าของ",
    "Work Type": "ประเภทงาน",
    "Total Hours": "ชั่วโมงรวม",
    "Start Time": "เวลาเริ่ม",
    "Stop Time": "เวลาสิ้นสุด",
    "Crop Area": "พื้นที่แปลง",
    "Work Area": "พื้นที่ที่ทำงาน",
    "Machine Name": "ชื่อเครื่องจักร",
    "Implement Width": "ความกว้างอุปกรณ์",
    "Total Distance": "ระยะทางรวม",
    "Fuel Consumption": "น้ำมันที่ใช้",
    "Emissions": "การปล่อยคาร์บอน",
    "Could not cancel this request.": "ยกเลิกคำขอไม่สำเร็จ",
    "Not set": "ยังไม่กำหนด",
    "Unknown": "ไม่ทราบ",
    "No date": "ไม่มีวันที่",
    "Cancelling…": "กำลังยกเลิก…",
    "Really cancel?": "ยืนยันการยกเลิก?",
  },
  vn: {
    "No fields registered to you yet.": "Bạn chưa có thửa ruộng nào",
    "No contractor is set up for your community yet.": "Cộng đồng chưa có nhà thầu",
    "Loading services…": "Đang tải dịch vụ…",
    "No forecast for this field — pick any date below.": "Không có dự báo cho thửa này — chọn ngày bên dưới",
    "Area": "Diện tích",
    "Service": "Dịch vụ",
    "Preferred Date": "Ngày mong muốn",
    "Next": "Tiếp",
    "Send this request?": "Gửi yêu cầu này?",
    "Send": "Gửi",
    "Choose Field": "Chọn thửa ruộng",
    "Choose Contractor": "Chọn nhà thầu",
    "Choose Service": "Chọn dịch vụ",
    "Review Request": "Xem lại yêu cầu",
    "Your community": "Cộng đồng của bạn",
    "Sending…": "Đang gửi…",
    "Send Request": "Gửi yêu cầu",
    "This crop is no longer active — it may have been archived or renewed.": "Cây trồng này không còn hoạt động — có thể đã lưu trữ hoặc sang vụ mới",
    "Back to My Fields": "Về Thửa ruộng",
    "Normal": "Thường",
    "NDVI": "NDVI",
    "Decoding satellite capture…": "Đang xử lý ảnh vệ tinh…",
    "Mean NDVI": "NDVI trung bình",
    "Satellite captured": "Ảnh chụp ngày",
    "Loading weather…": "Đang tải thời tiết…",
    "Seasonal outlook": "Dự báo mùa vụ",
    "No weather available for this field.": "Không có dữ liệu thời tiết cho thửa này",
    "No work recorded on this field yet.": "Chưa có công việc nào trên thửa này",
    "Check for a newer image": "Tìm ảnh mới hơn",
    "Map": "Bản đồ",
    "Weather": "Thời tiết",
    "Activities": "Hoạt động",
    "Could not load this field from AgroAPI.": "Không tải được thửa ruộng",
    "Could not load NDVI.": "Không tải được NDVI",
    "Crop not recorded": "Chưa ghi cây trồng",
    "No prediction yet": "Chưa có dự đoán",
    "Loading satellite…": "Đang tải ảnh vệ tinh…",
    "Field name": "Tên thửa ruộng",
    "Field boundary": "Ranh giới thửa",
    "Planting date": "Ngày gieo trồng",
    "New season": "Vụ mới",
    "The old season is kept in the field's history.": "Vụ cũ vẫn được lưu trong lịch sử thửa",
    "Start a new season": "Bắt đầu vụ mới",
    "Nothing planted yet, so there's no season to renew.": "Chưa gieo trồng nên chưa có vụ để làm mới",
    "Drag a point to move it, or tap the map to add one.": "Kéo điểm để di chuyển, chạm bản đồ để thêm điểm",
    "Loading crops…": "Đang tải cây trồng…",
    "No specific variety — no maturity prediction": "Không chọn giống — không dự đoán ngày thu hoạch",
    "Done": "Xong",
    "Start a new season?": "Bắt đầu vụ mới?",
    "Manage Field": "Quản lý thửa",
    "Field Name": "Tên thửa ruộng",
    "Edit Boundary": "Sửa ranh giới",
    "Change Crop": "Đổi cây trồng",
    "Select Variety": "Chọn giống",
    "Planting Date": "Ngày gieo trồng",
    "Could not start a new season.": "Không bắt đầu được vụ mới",
    "Save name": "Lưu tên",
    "Save boundary": "Lưu ranh giới",
    "Save planting date": "Lưu ngày gieo trồng",
    "Working…": "Đang xử lý…",
    "Renew": "Làm mới",
    "Clear": "Xoá",
    "Field size": "Diện tích thửa",
    "Boundary points": "Số điểm ranh giới",
    "When did you plant?": "Bạn gieo trồng khi nào?",
    "Size": "Diện tích",
    "Crop": "Cây trồng",
    "Draw Field Boundary": "Vẽ ranh giới thửa",
    "Name Your Field": "Đặt tên thửa",
    "What are you growing?": "Bạn trồng cây gì?",
    "Could not create the field.": "Không tạo được thửa ruộng",
    "Move the map to find your field, then tap around its edge.": "Di chuyển bản đồ đến thửa của bạn rồi chạm quanh mép",
    "Keep tapping to add points. Drag a point to adjust it.": "Chạm tiếp để thêm điểm, kéo để chỉnh",
    "Not recorded": "Chưa ghi",
    "Tap the map to start drawing": "Chạm bản đồ để bắt đầu vẽ",
    "Confirm Boundary": "Xác nhận ranh giới",
    "Creating…": "Đang tạo…",
    "Save Field": "Lưu thửa ruộng",
    "Smart Machine": "Smart Machine",
    "Phone number": "Số điện thoại",
    "Password": "Mật khẩu",
    "Sign In": "Đăng nhập",
    "Signing in…": "Đang đăng nhập…",
    "My Fields": "Thửa ruộng",
    "Requests": "Yêu cầu",
    "Profile": "Tài khoản",
    "Booking": "Lịch",
    "Machine": "Máy",
    "Report": "Báo cáo",
    "Settings": "Cài đặt",
    "Request Contractor": "Đặt dịch vụ",
    "Loading…": "Đang tải…",
    "No plots registered to you yet.": "Bạn chưa có thửa ruộng nào",
    "View Field": "Xem thửa",
    "Harvested": "Đã thu hoạch",
    "Season ended": "Đã kết thúc vụ",
    "Not planted yet": "Chưa gieo trồng",
    "Could not load your fields.": "Không tải được thửa ruộng",
    "Work Orders": "Đơn công việc",
    "Work Report": "Báo cáo công việc",
    "No requests yet — go to Farm and request a machine order.": "Chưa có yêu cầu — vào Thửa ruộng để đặt máy",
    "Your name": "Tên của bạn",
    "Edit": "Sửa",
    "This is how you sign in — changing it changes your login.": "Đây là số để đăng nhập — đổi số thì đăng nhập bằng số mới",
    "Cancel": "Huỷ",
    "Change Password": "Đổi mật khẩu",
    "At least 6 characters.": "Ít nhất 6 ký tự",
    "Language": "Ngôn ngữ",
    "Organization": "Tổ chức",
    "Community": "Cộng đồng",
    "Contractor": "Nhà thầu",
    "Currency": "Tiền tệ",
    "Area unit": "Đơn vị diện tích",
    "Joined": "Tham gia",
    "Log Out": "Đăng xuất",
    "Current password": "Mật khẩu hiện tại",
    "New password": "Mật khẩu mới",
    "Could not load your profile.": "Không tải được tài khoản",
    "Could not save.": "Không lưu được",
    "Saved": "Đã lưu",
    "Could not change password.": "Không đổi được mật khẩu",
    "Password changed": "Đã đổi mật khẩu",
    "Saving…": "Đang lưu…",
    "Save": "Lưu",
    "Work Order": "Đơn công việc",
    "Review Work Report": "Xem báo cáo",
    "Overview": "Tổng quan",
    "Total charge": "Tổng chi phí",
    "Close": "Đóng",
    "Status": "Trạng thái",
    "Field": "Thửa ruộng",
    "Work type": "Loại công việc",
    "Crop size": "Diện tích",
    "Scheduled": "Ngày hẹn",
    "Requested": "Ngày yêu cầu",
    "Note": "Ghi chú",
    "Cancel request": "Huỷ yêu cầu",
    "Back": "Quay lại",
    "Farmer Name": "Tên nông dân",
    "Unassigned": "Chưa gán",
    "Work Type": "Loại công việc",
    "Total Hours": "Tổng giờ",
    "Start Time": "Giờ bắt đầu",
    "Stop Time": "Giờ kết thúc",
    "Crop Area": "Diện tích thửa",
    "Work Area": "Diện tích đã làm",
    "Machine Name": "Tên máy",
    "Implement Width": "Bề rộng thiết bị",
    "Total Distance": "Tổng quãng đường",
    "Fuel Consumption": "Nhiên liệu tiêu thụ",
    "Emissions": "Phát thải",
    "Could not cancel this request.": "Không huỷ được yêu cầu",
    "Not set": "Chưa đặt",
    "Unknown": "Không rõ",
    "No date": "Chưa có ngày",
    "Cancelling…": "Đang huỷ…",
    "Really cancel?": "Xác nhận huỷ?",
  },
};

export function translate(text, lang) {
  if (!lang || lang === EN) return text;
  return DICT[lang]?.[text] ?? text;
}

// Module-level cache and subscribers, the same shape as useUnits: several
// components on one screen make one request, and a language change updates
// every mounted screen rather than only the one that changed it.
let cache = null;
let inFlight = null;
const subscribers = new Set();

async function fetchLang() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cache = d?.language || EN;
        return cache;
      })
      .catch(() => EN)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function clearLanguageCache() {
  cache = null;
  inFlight = null;
  fetchLang().then((l) => {
    for (const notify of subscribers) notify(l);
  });
}

// `t` for the signed-in person's language. Returns a function so a component
// reads `t("Save")` rather than threading the language through every call.
export function useT() {
  const [lang, setLang] = useState(cache || EN);

  useEffect(() => {
    let alive = true;
    const notify = (l) => {
      if (alive) setLang(l);
    };
    subscribers.add(notify);
    fetchLang().then(notify);
    return () => {
      alive = false;
      subscribers.delete(notify);
    };
  }, []);

  const t = (text) => translate(text, lang);
  t.lang = lang;
  return t;
}

export const LANGUAGES = [
  { code: "th", label: "ไทย" },
  { code: "en", label: "English" },
  { code: "vn", label: "Tiếng Việt" },
];
