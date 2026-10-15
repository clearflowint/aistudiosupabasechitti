-- Contact notes/remarks are not part of the CFCF contact model.
-- Existing values in this unused optional field are intentionally removed.
alter table public.contacts drop column if exists remarks;
