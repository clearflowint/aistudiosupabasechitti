DROP POLICY IF EXISTS cfcf_fund_entries_update_owner ON public.cfcf_fund_other_entries;
DROP POLICY IF EXISTS cfcf_fund_entries_delete_owner ON public.cfcf_fund_other_entries;

CREATE OR REPLACE FUNCTION public.cfcf_prevent_adjustment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Fund Other Adjustments are append-only. Record a correcting Credit or Debit instead of editing or deleting history.'
    USING ERRCODE='55000';
END;
$function$;

DROP TRIGGER IF EXISTS cfcf_fund_adjustments_immutable ON public.cfcf_fund_other_entries;
CREATE TRIGGER cfcf_fund_adjustments_immutable
BEFORE UPDATE OR DELETE ON public.cfcf_fund_other_entries
FOR EACH ROW EXECUTE FUNCTION public.cfcf_prevent_adjustment_mutation();

COMMENT ON TABLE public.cfcf_fund_other_entries IS
'Independent append-only Fund Other Adjustments ledger. Entries are not included in Fund financial totals, Cycle bills, shareholder payments, payouts, or Fund net balance. Correct mistakes with a compensating entry.';
