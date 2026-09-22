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
