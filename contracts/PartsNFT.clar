;; PartsNFT Contract
;; Manages NFTs for authentic laptop parts, providing verifiable ownership, history tracking,
;; revisions, certifications, warranties, supply chain logs, and transfer restrictions.

(define-non-fungible-token parts-nft uint)

;; Data Maps
(define-map part-metadata
  { part-id: uint }
  {
    serial: (string-ascii 64),
    auth-hash: (buff 32),
    manufacturer: principal,
    model: (string-ascii 64),
    description: (string-utf8 500),
    timestamp: uint
  }
)

(define-map part-revisions
  { part-id: uint, revision: uint }
  {
    updated-hash: (buff 32),
    update-notes: (string-utf8 200),
    timestamp: uint
  }
)

(define-map part-certifications
  { part-id: uint, certifier: principal }
  {
    cert-type: (string-ascii 32),
    expiry: uint,
    details: (string-utf8 200),
    active: bool
  }
)

(define-map part-warranties
  { part-id: uint }
  {
    duration: uint,
    terms: (string-utf8 300),
    start-time: uint,
    provider: principal
  }
)

(define-map supply-chain-logs
  { part-id: uint, log-index: uint }
  {
    actor: principal,
    action: (string-ascii 64),
    timestamp: uint,
    location: (optional (string-ascii 128))
  }
)

(define-map transfer-restrictions
  { part-id: uint }
  {
    restricted: bool,
    allowed-transferees: (list 10 principal)
  }
)

;; Constants
(define-constant err-not-authorized u100)
(define-constant err-invalid-id u101)
(define-constant err-already-exists u102)
(define-constant err-not-owner u103)
(define-constant err-invalid-revision u104)
(define-constant err-cert-expired u105)
(define-constant err-transfer-restricted u106)
(define-constant err-invalid-log u107)
(define-constant err-max-logs-reached u108)
(define-constant err-invalid-input u109)
(define-constant max-revisions u10)
(define-constant max-logs-per-part u50)
(define-constant max-serial-length u64)
(define-constant max-model-length u64)
(define-constant max-description-length u500)
(define-constant max-cert-type-length u32)
(define-constant max-details-length u200)
(define-constant max-action-length u64)
(define-constant max-location-length u128)
(define-constant max-terms-length u300)
(define-constant max-notes-length u200)

;; Variables
(define-data-var next-part-id uint u1)
(define-data-var contract-owner principal tx-sender)

;; Public Functions
(define-public (mint-part (serial (string-ascii 64)) (auth-hash (buff 32)) (model (string-ascii 64)) (description (string-utf8 500)))
  (let ((part-id (var-get next-part-id)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err err-not-authorized))
    (asserts! (is-none (map-get? part-metadata { part-id: part-id })) (err err-already-exists))
    (asserts! (<= (len serial) max-serial-length) (err err-invalid-input))
    (asserts! (<= (len model) max-model-length) (err err-invalid-input))
    (asserts! (<= (len description) max-description-length) (err err-invalid-input))
    (try! (nft-mint? parts-nft part-id tx-sender))
    (map-set part-metadata { part-id: part-id }
      {
        serial: serial,
        auth-hash: auth-hash,
        manufacturer: tx-sender,
        model: model,
        description: description,
        timestamp: block-height
      }
    )
    (var-set next-part-id (+ part-id u1))
    (ok part-id)
  )
)

(define-public (add-revision (part-id uint) (revision uint) (updated-hash (buff 32)) (notes (string-utf8 200)))
  (let ((metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err err-invalid-id))))
    (asserts! (is-eq tx-sender (get manufacturer metadata)) (err err-not-authorized))
    (asserts! (< revision max-revisions) (err err-invalid-revision))
    (asserts! (is-none (map-get? part-revisions { part-id: part-id, revision: revision })) (err err-already-exists))
    (asserts! (<= (len notes) max-notes-length) (err err-invalid-input))
    (map-set part-revisions { part-id: part-id, revision: revision }
      {
        updated-hash: updated-hash,
        update-notes: notes,
        timestamp: block-height
      }
    )
    (ok true)
  )
)

(define-public (certify-part (part-id uint) (cert-type (string-ascii 32)) (expiry uint) (details (string-utf8 200)))
  (let ((metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err err-invalid-id))))
    (asserts! (is-eq tx-sender (get manufacturer metadata)) (err err-not-authorized))
    (asserts! (<= (len cert-type) max-cert-type-length) (err err-invalid-input))
    (asserts! (<= (len details) max-details-length) (err err-invalid-input))
    (map-set part-certifications { part-id: part-id, certifier: tx-sender }
      {
        cert-type: cert-type,
        expiry: expiry,
        details: details,
        active: true
      }
    )
    (ok true)
  )
)

(define-public (add-warranty (part-id uint) (duration uint) (terms (string-utf8 300)))
  (let ((metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err err-invalid-id))))
    (asserts! (is-eq tx-sender (get manufacturer metadata)) (err err-not-authorized))
    (asserts! (<= (len terms) max-terms-length) (err err-invalid-input))
    (map-set part-warranties { part-id: part-id }
      {
        duration: duration,
        terms: terms,
        start-time: block-height,
        provider: tx-sender
      }
    )
    (ok true)
  )
)

(define-public (log-supply-chain (part-id uint) (action (string-ascii 64)) (location (optional (string-ascii 128))))
  (let ((metadata (unwrap! (map-get? part-metadata { part-id: part-id }) (err err-invalid-id)))
        (next-log-index (get-max-log-index part-id)))
    (asserts! (is-eq tx-sender (unwrap! (nft-get-owner? parts-nft part-id) (err err-invalid-id))) (err err-not-owner))
    (asserts! (< next-log-index max-logs-per-part) (err err-max-logs-reached))
    (asserts! (<= (len action) max-action-length) (err err-invalid-input))
    (match location loc (asserts! (<= (len loc) max-location-length) (err err-invalid-input)) true)
    (map-set supply-chain-logs { part-id: part-id, log-index: (+ next-log-index u1) }
      {
        actor: tx-sender,
        action: action,
        timestamp: block-height,
        location: location
      }
    )
    (ok true)
  )
)

(define-public (set-transfer-restriction (part-id uint) (restricted bool) (allowed (list 10 principal)))
  (asserts! (is-eq tx-sender (unwrap! (nft-get-owner? parts-nft part-id) (err err-invalid-id))) (err err-not-owner))
  (map-set transfer-restrictions { part-id: part-id }
    {
      restricted: restricted,
      allowed-transferees: allowed
    }
  )
  (ok true)
)

(define-public (transfer-part (part-id uint) (recipient principal))
  (let ((owner (unwrap! (nft-get-owner? parts-nft part-id) (err err-invalid-id)))
        (restrictions (map-get? transfer-restrictions { part-id: part-id })))
    (asserts! (is-eq tx-sender owner) (err err-not-owner))
    (if (is-some restrictions)
      (let ((rest (unwrap-panic restrictions)))
        (asserts! (or (not (get restricted rest)) (is-some (index-of? (get allowed-transferees rest) recipient))) (err err-transfer-restricted))
      )
      true
    )
    (try! (nft-transfer? parts-nft part-id tx-sender recipient))
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-part-metadata (part-id uint))
  (map-get? part-metadata { part-id: part-id })
)

(define-read-only (get-part-revision (part-id uint) (revision uint))
  (map-get? part-revisions { part-id: part-id, revision: revision })
)

(define-read-only (get-part-certification (part-id uint) (certifier principal))
  (map-get? part-certifications { part-id: part-id, certifier: certifier })
)

(define-read-only (get-part-warranty (part-id uint))
  (map-get? part-warranties { part-id: part-id })
)

(define-read-only (get-supply-chain-log (part-id uint) (log-index uint))
  (map-get? supply-chain-logs { part-id: part-id, log-index: log-index })
)

(define-read-only (get-transfer-restrictions (part-id uint))
  (map-get? transfer-restrictions { part-id: part-id })
)

(define-read-only (verify-part-authenticity (part-id uint) (provided-hash (buff 32)))
  (let ((metadata (unwrap! (get-part-metadata part-id) (err err-invalid-id))))
    (if (is-eq (get auth-hash metadata) provided-hash)
      (ok true)
      (err err-not-authorized)
    )
  )
)

(define-read-only (is-warranty-active (part-id uint))
  (let ((warranty (get-part-warranty part-id)))
    (if (is-some warranty)
      (let ((w (unwrap-panic warranty)))
        (ok (<= block-height (+ (get start-time w) (get duration w))))
      )
      (ok false)
    )
  )
)

(define-read-only (get-owner (part-id uint))
  (ok (nft-get-owner? parts-nft part-id))
)

;; Private Helper Functions
(define-private (get-max-log-index (part-id uint))
  (fold count-logs (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20 u21 u22 u23 u24 u25 u26 u27 u28 u29 u30 u31 u32 u33 u34 u35 u36 u37 u38 u39 u40 u41 u42 u43 u44 u45 u46 u47 u48 u49 u50) u0)
)

(define-private (count-logs (index uint) (max uint))
  (if (is-some (map-get? supply-chain-logs { part-id: part-id, log-index: index }))
    (+ max u1)
    max
  )
)