# Release-evidence

`pnpm run release:evidence` maakt een machineleesbare bundel onder
`release-evidence/` met:

- Git- en toolchainmetadata;
- volledige productie-audituitvoer;
- CycloneDX-SBOM;
- migratiechecksums;
- build- en store-assetchecksums;
- AAB-pad en SHA-256 wanneer een bundle aanwezig is;
- publieke signingfingerprint wanneer CI die heeft vastgesteld;
- expliciete deploymentstatus.

De evidencegenerator verzint geen test-, signing- of deploymentresultaat.
Ontbrekende informatie blijft `null` of `not-provided`.

De CI uploadt evidence ook bij een mislukte gate. Zo is een rood resultaat
onderzoekbaar zonder het als releasegoedkeuring te presenteren.
