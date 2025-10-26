(define-constant smart-wallet-contract (as-contract tx-sender))

;; ============================================
;; INVARIANTS
;; ============================================

;; The current owner is always an admin.
(define-read-only (invariant-current-owner-is-admin)
  (default-to false (map-get? admins (var-get owner)))
)

;; The contract itself is always an admin.
(define-read-only (invariant-contract-is-admin)
  (default-to false (map-get? admins smart-wallet-contract))
)

;; The wallet's STX balance should be 0 before funding.
(define-read-only (invariant-initial-wallet-stx-balance)
  (let (
      (num-passed-stx-fund-calls
        (default-to u0 (get called (map-get? context "fund-wallet-stx")))
      )
    )
    (or
      (> num-passed-stx-fund-calls u0)
      (is-eq (stx-get-balance smart-wallet-contract) u0)
    )
  )
)

;; The wallet's SBTC balance should be 0 before funding.
(define-read-only (invariant-initial-wallet-sbtc-balance)
  (let (
      (num-passed-sbtc-fund-calls
        (default-to u0 (get called (map-get? context "fund-wallet-sbtc")))
      )
    )
    (or
      (> num-passed-sbtc-fund-calls u0)
      (is-eq (sbtc-get-balance smart-wallet-contract) u0)
    )
  )
)

;; The successful stx-transfer calls count is always 0 if the wallet has not
;; been funded with STX.
(define-read-only (invariant-successful-stx-transfer-calls-count)
  (let (
      (num-passed-stx-fund-calls
        (default-to u0 (get called (map-get? context "fund-wallet-stx")))
      )
      (num-passed-stx-transfer-calls
        (default-to u0 (get called (map-get? context "stx-transfer")))
      )
    )
    (or
      (> num-passed-stx-fund-calls u0)
      (is-eq num-passed-stx-transfer-calls u0)
    )
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

;; Attempts to fund the wallet with STX.
(define-public (fund-wallet-stx (amount uint))
  (stx-transfer? amount tx-sender smart-wallet-contract)
)

;; Attempts to fund the wallet with sBTC.
(define-public (fund-wallet-sbtc (amount uint))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount tx-sender smart-wallet-contract none
  )
)

;; Gets the balance of the wallet's sBTC.
(define-read-only (sbtc-get-balance (who principal))
  (unwrap-panic
    (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      get-balance who
    ))
)
