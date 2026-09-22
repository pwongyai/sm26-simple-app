-- SM26: language belongs to the person, not the business.
--
-- It lived only on contractor_organizations, so a contractor's choice applied
-- to his whole business and a farmer had nowhere to put one at all. Hương Ngải
-- has Vietnamese farmers and a Vietnamese contractor; Ruang Kaeo has Thai ones;
-- Dr. Danh reads English. Three people on one screen can each need a different
-- language (2026-09-23).
--
-- Null means English, so every existing account keeps working unchanged.
-- Same three codes the contractor toggle already writes: th, en, vn.

begin;

alter table public.app_users add column if not exists language text;

alter table public.app_users
  add constraint app_users_language_check
  check (language is null or language in ('th', 'en', 'vn'));

-- Carry over what contractors already chose, so nobody re-picks it.
update public.app_users u
   set language = o.language
  from public.contractor_organizations o
 where o.agro_contractor_org_id = u.contractor_agro_org_id
   and u.language is null
   and o.language in ('th', 'en', 'vn');

commit;
