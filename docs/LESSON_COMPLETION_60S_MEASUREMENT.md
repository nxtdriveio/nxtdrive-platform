# Lesafronding: meting op maximaal 60 seconden

## Canonieke grens

De productiemeting gebruikt
`quick_panel_interactive_to_publish_ack_v1`:

1. start zodra het snelle afrondpaneel interactief is;
2. inclusief lezen, invoer, bevestiging en serverroundtrips;
3. einde zodra publiceren succesvol door de server is bevestigd.

Exact 60.000 ms slaagt; 60.001 ms niet. Alleen de canonieke quickflow schrijft
de event `ris.lesson_completion_usability_measured` naar de insert-only
`audit_log`. De event bevat sessie-id, viewport, duur, doel en `within_target`,
maar geen vrije tekst uit de leskaart.

## Uitvoering met echte gebruikers

Gebruik productie- of acceptatieaccounts van echte instructeurs en laat iedere
deelnemer normale lessen afronden zonder voordoen of testdata-invoer. Noteer
alleen context die niet al in telemetry zit (apparaat en eventuele observatie)
in het onderzoekslog; kopieer geen leerlinginhoud.

De release-evaluatie vereist minimaal 15 geldige afrondingen door minimaal vijf
instructeurs, verdeeld over ten minste twee dagen. De grens slaagt wanneer:

- iedere afzonderlijke geldige afronding maximaal 60 seconden duurt;
- er geen publicatiefout optreedt;
- de meting voor de gebruikte viewport is opgeslagen.

Analysequery voor een tenant:

```sql
select
  actor_user_id,
  created_at,
  (payload ->> 'duration_ms')::integer as duration_ms,
  (payload ->> 'within_target')::boolean as within_target,
  (payload ->> 'viewport_width')::integer as viewport_width,
  (payload ->> 'viewport_height')::integer as viewport_height
from public.audit_log
where tenant_id = :tenant_id
  and action = 'ris.lesson_completion_usability_measured'
  and payload ->> 'boundary_version'
    = 'quick_panel_interactive_to_publish_ack_v1'
order by created_at desc;
```

Telemetry maakt de echte gebruikerstest uitvoerbaar en controleerbaar, maar telt
pas als gebruikersonderzoek nadat de vereiste unieke instructeurs de flow
daadwerkelijk hebben doorlopen.
