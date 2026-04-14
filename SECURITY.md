# Security Policy

## Reporting a vulnerability

If you discover a security issue in `bull-viewer`, please **do not open a
public issue**. Instead, open a private security advisory on GitHub:

<https://github.com/grmkris/bull-viewer/security/advisories/new>

I aim to triage within a few days and ship a fix in the next patch release.

## Scope

In scope:

- `@grmkris/bull-viewer-{core,api,mcp,ui,next,standalone}` (this repo)
- The `grmkris/bull-viewer` Docker image
- Authentication / authorization bugs that let a viewer act outside their
  declared scopes

Out of scope:

- Vulnerabilities in BullMQ, Redis, or other upstream dependencies — please
  report those upstream
- Issues in host applications that _embed_ `@grmkris/bull-viewer-next`
  incorrectly (e.g. forwarding cookies to an untrusted origin)

## Supported versions

Only the latest minor release is supported. The current line is `0.1.x`.
