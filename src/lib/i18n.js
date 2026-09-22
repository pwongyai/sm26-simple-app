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
