-- SM26: claim_next_field_number still pointed at a table that no longer exists.
--
-- The organisations table was renamed `organizations` -> `farm_organizations`
-- and this function was not renamed with it, so every call raised
-- "relation organizations does not exist". The API turned that into
-- "Could not assign a field number" and workflow C — a contractor drawing a
-- new field for a customer — could not complete for EITHER community
-- (found 2026-09-24 testing Huong Ngai).
--
-- The counter columns were fine all along: RK is at 550, HN at 1.
--
-- Also returns null rather than raising when the org id is unknown, so the
-- caller can say which org it could not number instead of a 500.

create or replace function public.claim_next_field_number(org_id text)
returns integer
language plpgsql
as $$
declare
  claimed integer;
begin
  update public.farm_organizations
     set next_field_number = next_field_number + 1
   where id = org_id
  returning next_field_number - 1 into claimed;

  return claimed;
end;
$$;
