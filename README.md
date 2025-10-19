# csw-locker-contract

**csw-locker-contract** is the smart contract codebase for the **CSW-Locker** project, built using [Clarity](https://docs.stacks.co/docs/clarity/), the smart contract language for the Stacks blockchain.  
This repository contains all the core contracts that power CSW-Locker — a decentralized platform for secure asset locking, permission management, and programmatic release.

## Features

- 🧱 Modular Clarity contracts for:
  - Asset lockers
  - Permissioned access control
  - Time-based and condition-based release mechanisms
- 🔐 Secure and composable logic
- 🧪 Contracts designed with testability and auditability in mind

## Purpose

This repo serves as the foundational layer of on-chain logic for the **CSW-Locker** ecosystem, enabling decentralized and trust-minimized workflows.

## Getting Started

To build and test contracts locally:

```bash
clarinet check
pnpm install
pnpm generate
pnpm test
```
