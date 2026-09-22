-- SM26: passwords on the phone login, and the Vietnam test accounts.
--
-- Until now signing in needed only a phone number — deliberate for a prototype
-- the developer click-tested alone, and recorded as such in identity-schema.sql.
-- Huong Ngai puts the app in front of people who are not us, so the number
-- becomes the user ID and a password becomes the proof.
--
-- Hashes are scrypt (src/lib/password.js), Node's own KDF — no native addon to
-- compile, and the cost parameters travel inside each hash so they can be
-- raised later without invalidating existing passwords.
--
-- NOTE: no password is set here. Seeded accounts start with password_hash NULL
-- and CANNOT sign in until one is set with `node set-password.js <phone>`,
-- which prompts for the value and never writes it anywhere but the hash. A
-- password in a migration file is a password in git.

alter table public.app_users add column if not exists password_hash text;


-- The Vietnam side. Everything except the two accounts already existed:
-- the HN farm organisation (VND, sào, 360 m²), Nguyen The Thinh's contractor
-- organisation, and an active default relationship between them.

-- HN was seeded inactive. Huong Ngai is the live site now.
update public.farm_organizations set active = true where id = 'HN';

-- Nguyen's organisation was seeded as Thai. Note the value is 'vn', not the
-- ISO language code 'vi': that is what the existing check constraint and the
-- contractor settings toggle both use, and one spelling is worth more than
-- being right about ISO 639-1.
update public.contractor_organizations
   set language = 'vn', updated_at = now()
 where agro_contractor_org_id = '59296315-2537-4184-9cc9-8d24db0eae0f';

-- Two test accounts. Ruang Kaeo uses 08… for a farmer and 09… for a
-- contractor; Vietnam keeps that role digit and swaps the leading 0 for a 1,
-- so the country is visible at a glance and the two sites cannot be confused
-- when someone reads a number aloud.
insert into public.app_users (phone, name, role, organization_id, contractor_agro_org_id)
values ('1800000001', 'Mr. Trung', 'farmer', 'HN', null)
on conflict (phone) do nothing;

insert into public.app_users (phone, name, role, organization_id, contractor_agro_org_id)
values ('1900000001', 'Mr. Thinh', 'contractor', 'HN',
        '59296315-2537-4184-9cc9-8d24db0eae0f')
on conflict (phone) do nothing;


-- A contractor with no services cannot price a job, so the app is unusable for
-- them even though everything else is wired. Harvesting only: it is what the
-- 24 Sep demo shows, and it is the one work type that maps to ADAPT in a single
-- step. Price is a placeholder — the contractor sets their own on the settings
-- screen, which is the whole point of services being free-form.
-- 150,000 VND per sào (360 m²), set by the project. The contractor can change
-- it, and add services, on the Settings screen — services are free-form by
-- design and the app already supports add/edit/delete.
insert into public.services (name, activity_canonical, adapt_code, price_per_unit,
                             active, contractor_agro_org_id, sort_order)
select 'Harvesting', 'harvesting', 'HARVEST', 150000, true,
       '59296315-2537-4184-9cc9-8d24db0eae0f', 50
where not exists (
  select 1 from public.services
   where contractor_agro_org_id = '59296315-2537-4184-9cc9-8d24db0eae0f'
     and activity_canonical = 'harvesting'
);
