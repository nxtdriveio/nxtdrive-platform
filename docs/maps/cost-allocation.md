# Kostenmodel

Er zijn drie strikt gescheiden waarden:

1. bruto gebruikswaarde: units maal versieerbare SKU-lijstprijs;
2. toegerekende tenantkosten: een configureerbare interne allocatie;
3. werkelijke accountkosten: geïmporteerde Google Cloud Billing Export of handmatige reconciliatie.

UI en API noemen een bruto- of allocatiewaarde nooit een factuur. Prijsstaffels staan in `maps_cost_price_versions` en `maps_sku_prices`, met USD en geldigheidsperiode.

Ondersteunde allocatiemethoden zijn bruto, pro rata, na gedeelde credits, abonnementsinclusief, fair-use en bundel plus overgebruik. De commerciële standaard is bewust nog niet definitief gemaakt.

`maps_cost_reconciliations` bewaart project, service, SKU, periode, units, bruto, credits en werkelijke accountkosten. Een gedeelde kosteloze cap wordt op accountniveau gereconcilieerd en niet fictief per tenant vermenigvuldigd.
