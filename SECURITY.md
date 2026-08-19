# Security policy

## Supported versions

We support the most recent minor release of each published adapter.

## Report a vulnerability

Do not open a public issue for a security problem.

Send the report to **security@bunny.net**, or use the
[bunny.net vulnerability disclosure
programme](https://hackerone.com/bunnynet). Include the affected package, the
version, and the steps to reproduce.

We confirm receipt within three working days.

## Scope

These adapters run your framework inside an Edge Script, and they read and write
Bunny Storage. A report is in scope when it lets somebody:

- read a storage password, an API key, or another secret out of a build artefact;
- read or write an object outside the configured storage zone;
- run code that the site owner did not deploy.

A misconfigured pull zone or storage zone is not in scope here. Report that
through the [bunny.net support](https://dash.bunny.net/support) channel.
