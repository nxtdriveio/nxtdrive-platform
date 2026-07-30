# Limieten en degradatie

Limieten ondersteunen gebruiker-, tenant-, feature-, SKU-, omgeving- en globalscope en uur-, dag- en maandperioden.

Standaardsignalen zijn 50%, 70%, 85% en 100%, maar staan per limitrecord opgeslagen. Een hard limit stopt providerverbruik, niet de veilige kernflow.

| Functie | Fallback |
| --- | --- |
| Autocomplete | handmatige invoer |
| Validation | handmatige bevestiging met reden |
| Kaart | lijst en adres |
| Traffic | niet-traffic route |
| Matrix | cache, rayon of Haversine |
| Conflict | waarschuwing met fallbacklabel |
| Aanbeveling | bestaande harde planningscriteria |
| Optimalisatie | lokale heuristiek of uit |
| Examenadvies | configureerbare vaste buffer |
| Analytics | laatste complete periode |

Iedere degradatie heeft status, reason code, correlation ID en een zichtbaar label. Circuit breakers bestaan globaal, per API, tenant en feature en openen bij quota, credentials, hoge errorratio, budget, onverwacht gebruik of timeoutstorm.
