# Android permissioninventaris

| Permission                    | Beschermingsniveau | Reden                                       |
| ----------------------------- | ------------------ | ------------------------------------------- |
| `android.permission.INTERNET` | normal             | HTTPS-toegang tot de NXTDRIVE-webapp en API |

De productie-manifest vraagt geen camera-, microfoon-, locatie-, contacten-,
opslag- of sensorpermission. Cleartextverkeer en mixed content zijn
uitgeschakeld. Iedere toekomstige permission vereist een nieuwe inventaris,
Data Safety-review en functionele test.
