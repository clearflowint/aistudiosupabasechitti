CREATE OR REPLACE FUNCTION public.cfcf_require_adjustment_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.adjustment_category IS NULL
     OR NEW.adjustment_category NOT IN ('outside_money','commission','discount','stationery','others') THEN
    RAISE EXCEPTION 'Choose a valid Fund Other Adjustment category'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cfcf_fund_adjustment_category_required ON public.cfcf_fund_other_entries;
CREATE TRIGGER cfcf_fund_adjustment_category_required
BEFORE INSERT ON public.cfcf_fund_other_entries
FOR EACH ROW EXECUTE FUNCTION public.cfcf_require_adjustment_category();

COMMENT ON COLUMN public.cfcf_fund_other_entries.adjustment_category IS
'Required for all new entries. NULL is retained only for legacy entries created before categories were introduced.';
