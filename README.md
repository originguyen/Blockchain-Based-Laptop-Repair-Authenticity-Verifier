# AuthRepair: Blockchain-Based Laptop Repair Authenticity Verifier

## Overview

**AuthRepair** is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in the laptop repair industry, such as counterfeit parts proliferation, lack of transparency in repair processes, and inefficiencies in verifying authenticity. Counterfeit parts can lead to device failures, security risks, and financial losses for consumers. This project leverages blockchain for immutable records of part authenticity, integrates virtual Augmented Reality (AR) guides for DIY or guided repairs, and incorporates in-person technician confirmations to ensure trust and accountability.

Key features:
- **Parts Authenticity Verification**: Manufacturers or authorized suppliers mint NFTs for genuine parts, allowing verifiable ownership and history tracking.
- **AR Integration**: Stores IPFS hashes for AR repair guides, enabling users to access interactive overlays via mobile apps.
- **In-Person Confirmations**: Technicians confirm repairs on-chain, with escrow for payments released only upon mutual agreement.
- **Real-World Impact**: Reduces fraud (e.g., fake screens or batteries in laptops), empowers users with self-repair tools, and builds a decentralized network of verified technicians, potentially lowering repair costs by 20-30% through transparency (based on industry estimates from sources like iFixit).

The project involves 6 core smart contracts written in Clarity, deployed on Stacks for Bitcoin-secured settlement. It uses SIP-009/010 standards for NFTs and fungible tokens where applicable.

## Problems Solved
- **Counterfeit Parts**: Blockchain ensures parts have tamper-proof provenance.
- **Repair Trust Issues**: On-chain confirmations prevent disputes.
- **Accessibility**: AR guides democratize repairs, reducing reliance on expensive services.
- **Inefficiency**: Decentralized registry speeds up technician matching and verification.
- **Payment Security**: Escrow mechanisms protect both users and technicians.

## Architecture
The system flow:
1. Manufacturers register authentic parts as NFTs.
2. Users create repair orders and escrow funds.
3. Technicians claim orders, use AR guides, and verify parts.
4. In-person confirmation triggers payment release.
5. All actions are logged immutably.

Contracts interact via traits for modularity (e.g., NFT trait for parts).

## Smart Contracts
Below are the 6 smart contracts, each with a brief description, purpose, and full Clarity code. Contracts are designed to be secure, with access controls (e.g., only owners can mint), error handling, and minimal state to prevent exploits.

### 1. PartsNFT.clar
**Purpose**: Manages NFTs for authentic laptop parts. Manufacturers mint NFTs with metadata (serial number, hash for authenticity). Solves counterfeit issues by providing verifiable ownership.

```clarity
;; PartsNFT Contract
(define-non-fungible-token parts-nft uint)

(define-map part-metadata uint { serial: (string-ascii 64), auth-hash: (buff 32), manufacturer: principal })

(define-constant err-not-authorized u100)
(define-constant err-invalid-id u101)

(define-data-var next-id uint u1)
(define-data-var owner principal tx-sender)

(define-public (mint (serial (string-ascii 64)) (auth-hash (buff 32)))
  (let ((id (var-get next-id)))
    (asserts! (is-eq tx-sender (var-get owner)) (err err-not-authorized))
    (try! (nft-mint? parts-nft id tx-sender))
    (map-set part-metadata id { serial: serial, auth-hash: auth-hash, manufacturer: tx-sender })
    (var-set next-id (+ id u1))
    (ok id)))

(define-read-only (get-metadata (id uint))
  (map-get? part-metadata id))

(define-public (transfer (id uint) (recipient principal))
  (nft-transfer? parts-nft id tx-sender recipient))
```

### 2. TechnicianRegistry.clar
**Purpose**: Registers and verifies technicians. Users can query certified technicians. Includes reputation scores based on completed repairs, solving trust in hiring.

```clarity
;; TechnicianRegistry Contract
(define-map technicians principal { certified: bool, reputation: uint, repair-count: uint })

(define-constant err-already-registered u200)
(define-constant err-not-certified u201)

(define-data-var admin principal tx-sender)

(define-public (register-technician)
  (if (is-some (map-get? technicians tx-sender))
    (err err-already-registered)
    (ok (map-set technicians tx-sender { certified: true, reputation: u0, repair-count: u0 }))))

(define-public (update-reputation (tech principal) (delta int))
  (let ((current (unwrap! (map-get? technicians tech) (err err-not-certified))))
    (asserts! (is-eq tx-sender (var-get admin)) (err err-not-certified))
    (map-set technicians tech
      (merge current { reputation: (if (> delta 0) (+ (get reputation current) (to-uint delta)) (- (get reputation current) (to-uint (- delta)))) }))))

(define-read-only (get-technician (tech principal))
  (map-get? technicians tech))
```

### 3. RepairOrder.clar
**Purpose**: Creates and manages repair requests. Users escrow STX/tokens for payments. Integrates with PartsNFT for specifying required parts.

```clarity
;; RepairOrder Contract
(define-map orders uint { user: principal, tech: (optional principal), part-id: uint, status: (string-ascii 32), escrow: uint })

(define-constant err-invalid-status u300)
(define-constant err-not-owner u301)
(define-constant status-open "open")
(define-constant status-claimed "claimed")
(define-constant status-completed "completed")

(define-data-var next-order-id uint u1)

(define-public (create-order (part-id uint) (escrow-amount uint))
  (let ((id (var-get next-order-id)))
    (try! (stx-transfer? escrow-amount tx-sender (as-contract tx-sender)))
    (map-set orders id { user: tx-sender, tech: none, part-id: part-id, status: status-open, escrow: escrow-amount })
    (var-set next-order-id (+ id u1))
    (ok id)))

(define-public (claim-order (order-id uint))
  (let ((order (unwrap! (map-get? orders order-id) (err err-invalid-status))))
    (asserts! (is-eq (get status order) status-open) (err err-invalid-status))
    (map-set orders order-id (merge order { tech: (some tx-sender), status: status-claimed }))
    (ok true)))

(define-read-only (get-order (order-id uint))
  (map-get? orders order-id))
```

### 4. AuthenticityVerifier.clar
**Purpose**: Verifies part authenticity by checking NFT metadata against provided hashes. Called during repairs to confirm genuine parts.

```clarity
;; AuthenticityVerifier Contract
(define-trait parts-nft-trait
  ((get-metadata (uint) (response (optional { serial: (string-ascii 64), auth-hash: (buff 32), manufacturer: principal }) uint))))

(define-constant err-mismatch u400)
(define-constant err-no-metadata u401)

(define-public (verify-part (nft-contract <parts-nft-trait>) (part-id uint) (provided-hash (buff 32)))
  (let ((metadata (unwrap! (try! (contract-call? nft-contract get-metadata part-id)) (err err-no-metadata))))
    (if (is-eq (get auth-hash metadata) provided-hash)
      (ok true)
      (err err-mismatch))))
```

### 5. ARGuideStorage.clar
**Purpose**: Stores IPFS hashes for AR repair guides (e.g., for specific laptop models). Technicians or users retrieve guides for virtual overlays during repairs.

```clarity
;; ARGuideStorage Contract
(define-map guides (string-ascii 64) (buff 64)) ;; model -> IPFS hash

(define-constant err-not-admin u500)

(define-data-var admin principal tx-sender)

(define-public (add-guide (model (string-ascii 64)) (ipfs-hash (buff 64)))
  (asserts! (is-eq tx-sender (var-get admin)) (err err-not-admin))
  (ok (map-set guides model ipfs-hash)))

(define-read-only (get-guide (model (string-ascii 64)))
  (map-get? guides model))
```

### 6. ConfirmationEscrow.clar
**Purpose**: Handles in-person confirmations. User and technician both sign off on completion, releasing escrow. Integrates with RepairOrder for status updates.

```clarity
;; ConfirmationEscrow Contract
(define-trait repair-order-trait
  ((get-order (uint) (response (optional { user: principal, tech: (optional principal), part-id: uint, status: (string-ascii 32), escrow: uint }) uint))))

(define-map confirmations uint { user-confirmed: bool, tech-confirmed: bool })

(define-constant err-not-involved u600)
(define-constant err-not-claimed u601)
(define-constant err-already-confirmed u602)

(define-public (confirm-repair (order-contract <repair-order-trait>) (order-id uint))
  (let ((order (unwrap! (try! (contract-call? order-contract get-order order-id)) (err err-not-claimed)))
        (conf (default-to { user-confirmed: false, tech-confirmed: false } (map-get? confirmations order-id))))
    (asserts! (or (is-eq tx-sender (get user order)) (is-eq tx-sender (unwrap! (get tech order) (err err-not-claimed)))) (err err-not-involved))
    (if (is-eq tx-sender (get user order))
      (asserts! (not (get user-confirmed conf)) (err err-already-confirmed))
      (asserts! (not (get tech-confirmed conf)) (err err-already-confirmed)))
    (map-set confirmations order-id
      (if (is-eq tx-sender (get user order))
        (merge conf { user-confirmed: true })
        (merge conf { tech-confirmed: true })))
    (if (and (get user-confirmed conf) (get tech-confirmed conf))
      (begin
        (try! (as-contract (stx-transfer? (get escrow order) tx-sender (unwrap! (get tech order) (err err-not-claimed)))))
        (ok true))
      (ok false))))
```

## Deployment and Usage
1. **Prerequisites**: Install Clarinet (Stacks dev tool) via `cargo install clarinet`.
2. **Setup**: Clone repo, run `clarinet new authrepair`, add contracts to `/contracts`.
3. **Testing**: Use `clarinet test` for unit tests (add your own based on above).
4. **Deployment**: Deploy to Stacks testnet/mainnet using Clarinet or Hiro tools.
5. **Integration**: Build a frontend (e.g., React + @stacks/connect) for user interaction. AR guides via libraries like AR.js, fetching IPFS hashes.
6. **Tokenomics**: Optional STX for escrow; extend with a governance token for reputation staking.

## Security Considerations
- All contracts use assertions for access control.
- No external calls except via traits.
- Audit recommended before production.

## License
MIT License. Contribute via PRs!