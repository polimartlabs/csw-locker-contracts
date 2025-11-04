(define-constant SIP018_MSG_PREFIX 0x534950303138)

;; Domain separator for all messages.
(define-read-only (get-domain-hash)
  (sha256 (unwrap-panic (to-consensus-buff? {
    ;; TODO: Decide domain details name and version.
    name: "smart-wallet-standard",
    version: "1.0.0",
    chain-id: chain-id,
  })))
)

;; ============================================================================
;; STX Transfer Message
;; ============================================================================
(define-read-only (build-stx-transfer-hash (details {
  auth-id: uint,
  amount: uint,
  recipient: principal,
  memo: (optional (buff 34)),
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        topic: "stx-transfer",
        auth-id: (get auth-id details),
        amount: (get amount details),
        recipient: (get recipient details),
        memo: (get memo details),
      })))
    )))
)

;; ============================================================================
;; Extension Call Message
;; ============================================================================
(define-read-only (build-extension-call-hash (details {
  auth-id: uint,
  extension: principal,
  payload: (buff 2048),
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        topic: "extension-call",
        auth-id: (get auth-id details),
        extension: (get extension details),
        payload: (get payload details),
      })))
    )))
)

;; ============================================================================
;; SIP-010 Transfer Message
;; ============================================================================
(define-read-only (build-sip010-transfer-hash (details {
  auth-id: uint,
  amount: uint,
  recipient: principal,
  memo: (optional (buff 34)),
  sip010: principal,
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        topic: "sip010-transfer",
        auth-id: (get auth-id details),
        amount: (get amount details),
        recipient: (get recipient details),
        memo: (get memo details),
        sip010: (get sip010 details),
      })))
    )))
)

;; ============================================================================
;; SIP-009 Transfer Message
;; ============================================================================
(define-read-only (build-sip009-transfer-hash (details {
  auth-id: uint,
  nft-id: uint,
  recipient: principal,
  sip009: principal,
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat (get-domain-hash)
      (sha256 (unwrap-panic (to-consensus-buff? {
        topic: "sip009-transfer",
        auth-id: (get auth-id details),
        nft-id: (get nft-id details),
        recipient: (get recipient details),
        sip009: (get sip009 details),
      })))
    )))
)
