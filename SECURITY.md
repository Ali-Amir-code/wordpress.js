# Security policy

This is pre-alpha software. There are no supported production releases yet. Do not use it to store sensitive customer data or expose an unconfigured installation to the internet.

Please report vulnerabilities privately using GitHub's **Report a vulnerability** control if it is enabled. Otherwise, contact the repository owner through the contact method on their GitHub profile and request a private channel. Do not put exploit details, passwords or database copies in a public issue. We do not yet offer a response-time guarantee.

The initial release targets one administrator, one site and one server process. The server enforces session authentication, request validation, same-origin mutations, draft/public separation and revision conflicts. These controls are a foundation, not a substitute for independent security review.

Before production: complete the security milestone in docs/ROADMAP.md, use HTTPS, configure the canonical site origin, back up the data directory, and review dependency advisories. Arbitrary third-party code is not sandboxed and is not installable from the admin.
