-- Make the existing route_lead_to_branch RPC event payload valid everywhere.
alter type public.lead_event_type add value if not exists 'routed';
