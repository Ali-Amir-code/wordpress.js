# ADR 0001: Begin with a single-site modular monolith

Status: accepted for the pre-alpha foundation. Date: 2026-11-24.

## Context

The repository starts empty. The first users need an approachable website builder; contributors need a local setup with few prerequisites. The product must own its content format and avoid coupling publishing to a paid service.

## Decision

Use TypeScript npm workspaces, React + Puck for the admin, Fastify for HTTP, shared React components for public HTML, and Node 24 SQLite behind a repository. Use an explicit versioned document schema. Separate drafts from published snapshots and enforce revision-based concurrency. Begin with one owner and one site.

## Consequences

Local development needs no database service. The editor and public rendering share components. We own authentication, persistence and migrations, so security testing is a release gate. SQLite limits the initial deployment to a small single-server workload. Node's SQLite API availability/stability must be checked when changing runtime versions. Later PostgreSQL and plugin support require separate tested work; folders alone do not implement these features.

Alternatives and source links are in [RESEARCH.md](../RESEARCH.md). Revisit if measured concurrency, team capacity or product requirements justify a different foundation.
