# Provider research record

Official Google documentation reviewed on 2026-07-30:

- Places API (New), session tokens and field masks.
- Address Validation response interpretation and confirmation logic.
- Geocoding API v4.
- Routes `computeRouteMatrix`, per-element errors, field masks and matrix billing.
- Route Optimization API, OAuth/IAM and `optimizeTours`.

Implementation consequences:

- Autocomplete tokens are session-scoped and resolved sessions are closed.
- Place Details requests select only address fields required by NXTDrive.
- Matrix usage is metered by origin × destination elements, never by HTTP request.
- Provider responses are validated per element and partial results are labeled.
- Traffic-aware matrix batches are conservatively capped below the general maximum.
- Optimization uses an OAuth access-token boundary and cannot publish appointments.

Authoritative references:

- https://developers.google.com/maps/documentation/places/web-service/place-session-tokens
- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- https://developers.google.com/maps/documentation/address-validation/understand-response
- https://developers.google.com/maps/documentation/address-validation/build-validation-logic
- https://developers.google.com/maps/documentation/routes/compute_route_matrix
- https://developers.google.com/maps/documentation/routes/usage-and-billing
- https://developers.google.com/maps/documentation/route-optimization/overview
- https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours
- https://developers.google.com/maps/documentation/geocoding/start-v4

No contractual conclusion or Google billing activation is claimed by this record.
