# CSP en kaartorigin

De huidige globale CSP gebruikt nonces, `strict-dynamic` en geen `unsafe-eval`. Die basis wordt niet verzwakt voor Maps.

De gekozen voorbereiding is een geïsoleerde renderer op exact `https://maps.nxtdrive.io`, aangestuurd met een korte, opaque servertoken. De hoofdapp blijft list-first en stuurt nooit een volledige tenantdataset of API-key naar een willekeurige frame-origin.

Productieactivering vereist nog:

1. ownership en deployment van `maps.nxtdrive.io`;
2. een exacte `frame-src` toevoeging, geen wildcard;
3. postMessage origincontrole in beide richtingen;
4. browserkey die alleen deze origin accepteert;
5. CSP- en map-load-telemetrie;
6. een EER/Google-contractcheck.

Tot die gate is afgerond blijft `NEXT_PUBLIC_MAP_RENDER_ORIGIN` niet actief en tonen planbord en management een volwaardige lijstfallback. Dit is een bewuste veilige degradatie, geen stille kaartfout.
