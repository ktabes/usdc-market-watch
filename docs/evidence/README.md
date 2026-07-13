# Evidence records

This directory holds auditable phase-gate records, not generated test artifacts.

Each phase record must contain:

- Date and repository revision or explicit pre-commit state.
- Acceptance-criteria checklist.
- Exact verification commands and concise results.
- Test file and test counts, including explicit skips.
- Independent reviewer scope, findings, and disposition.
- Known limitations and the next blocked phase.

Do not place secrets, raw personal CSVs, wallet lists, or unredacted database URLs here. Later onchain evidence should use public transaction hashes, contract addresses, block numbers, and source links only after deliberate verification.
