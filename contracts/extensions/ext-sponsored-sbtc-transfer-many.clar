;; title: ext-sbtc-transfer-many
;; version: 1.0
;; summary: Transfers sBTC tokens to many recipients using custom tuple format.
;; description: Optimized for buffer size. Transfers can be sponsored, fees paid in sBTC.

(define-constant err-invalid-payload (err u500))

;; Uses native transfer-many function with custom tuple transformation. More
;; efficient cost-wise.
;;
;; Max recipients:
;; - 41 standard principals
;; - 11 contract principals
(define-private (sbtc-transfer-many (recipients (list
  200
  {
    amount: uint,
    sender: principal,
    to: principal,
    memo: (optional (buff 34)),
  }
)))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    transfer-many recipients
  )
)

(define-private (sbtc-transfer
    (amount uint)
    (from principal)
    (to principal)
  )
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount from to none
  )
)

(define-private (to-native (transfer {
  a: uint,
  r: principal,
}))
  {
    amount: (get a transfer),
    sender: tx-sender,
    to: (get r transfer),
    memo: none,
  }
)

(define-public (call (payload (buff 2048)))
  (let ((details (unwrap!
      (from-consensus-buff? {
        recipients: (list
          200
          {
            a: uint,
            r: principal,
          }
        ),
        fees: uint,
      }
        payload
      )
      err-invalid-payload
    )))
    (try! (sbtc-transfer-many (map to-native (get recipients details))))
    (match tx-sponsor?
      spnsr (let ((fees (get fees details)))
        (and (> fees u0) (try! (sbtc-transfer fees tx-sender spnsr)))
      )
      true
    )
    (ok true)
  )
)
